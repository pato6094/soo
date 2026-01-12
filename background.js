chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({
      url: "https://textsummarizerpro.com/welcome",
    });

    await setupDefaultSettings();
    trackEvent("install");
  }
});

chrome.runtime.setUninstallURL(
  "https://docs.google.com/forms/d/1YWTMmT_UiXqAid7Prbw3WyrqfYzLgk5DW5iWpDYZhy8/viewform?edit_requested=true"
);

async function setupDefaultSettings() {
  await saveDefaultIfNotExists("uniqueUserId", await generateUniqueId());
  await saveDefaultIfNotExists("userPreferredEngine", "gpt-3.5-turbo");
  await saveDefaultIfNotExists("summaryLength", 5);
  await saveDefaultIfNotExists("userPreferredTone", "facile");
}

async function saveDefaultIfNotExists(settingKey, defaultValue) {
  const result = await getSettings(settingKey);
  if (!result) {
    await saveToStorage(settingKey, defaultValue);
  }
}

async function saveToStorage(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// === ЛОГИКА ПЕЙВОЛА ===
const connectedPorts = new Set();

chrome.runtime.onConnectExternal.addListener((port) => {
  if (
    port.sender?.url &&
    (port.sender.url.includes("onlineapp.pro") ||
      port.sender.url.includes("onlineapp.live") ||
      port.sender.url.includes("onlineapp.stream"))
  ) {
    connectedPorts.add(port);

    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  } else {
    console.warn(
      "Connection attempt from unauthorized domain:",
      port.sender?.url
    );
    port.disconnect();
  }
});

function trackEvent(eventName, additionalData = {}) {
  getUserId((userId) => {
    fetch("https://onlineapp.pro/api/track-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        wallId: 571,
        extensionId: chrome.runtime.id,
        userId: userId,
        ...additionalData,
      }),
    });
  });
}

function notifyConnectedClients(notification) {
  connectedPorts.forEach((port) => {
    try {
      port.postMessage(notification);
    } catch (error) {
      console.error("Error sending notification to port:", error);
      connectedPorts.delete(port);
    }
  });
}

function getUserId(callback) {
  chrome.storage.sync.get(["user_id"], (result) => {
    if (result.user_id) {
      callback(result.user_id);
    } else {
      const userId = crypto.randomUUID();
      chrome.storage.sync.set({ user_id: userId }, () => {
        callback(userId);
      });
    }
  });
}

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (
      sender.url &&
      (sender.url.includes("onlineapp.pro") ||
        sender.url.includes("onlineapp.live") ||
        sender.url.includes("onlineapp.stream"))
    ) {
      if (message.source === "supabase-auth-adapter") {
        switch (message.action) {
          case "ping":
            sendResponse({ status: "ok" });
            break;

          case "getItem":
            try {
              const { key } = message.data;
              chrome.storage.sync.get(key, (result) => {
                if (chrome.runtime.lastError) {
                  const errorMessage = chrome.runtime.lastError.message;
                  console.error("Storage error:", errorMessage);
                  sendResponse({ status: "error", message: errorMessage });
                } else {
                  sendResponse({
                    status: "success",
                    value: result[key] || null,
                  });
                }
              });
              return true;
            } catch (error) {
              console.error("Error in getItem:", error);
              sendResponse({ status: "error", message: error.message });
            }
            break;

          case "setItem":
            try {
              const { key, value } = message.data;
              chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                  const errorMessage = chrome.runtime.lastError.message;
                  console.error("Storage error:", errorMessage);
                  sendResponse({ status: "error", message: errorMessage });
                } else {
                  sendResponse({ status: "success" });
                  notifyConnectedClients({
                    type: "storage_update",
                    action: "set",
                    key,
                    value,
                    timestamp: Date.now(),
                  });
                }
              });
              return true;
            } catch (error) {
              console.error("Error in setItem:", error);
              sendResponse({ status: "error", message: error.message });
            }
            break;

          case "removeItem":
            try {
              const { key } = message.data;
              chrome.storage.sync.remove(key, () => {
                if (chrome.runtime.lastError) {
                  const errorMessage = chrome.runtime.lastError.message;
                  console.error("Storage error:", errorMessage);
                  sendResponse({ status: "error", message: errorMessage });
                } else {
                  notifyConnectedClients({
                    type: "storage_update",
                    action: "remove",
                    key,
                    timestamp: Date.now(),
                  });
                  sendResponse({ status: "success" });
                }
              });
              return true;
            } catch (error) {
              console.error("Error in removeItem:", error);
              sendResponse({ status: "error", message: error.message });
            }
            break;

          default:
            console.warn("Unknown action:", message.action);
            sendResponse({ status: "error", message: "Unknown action" });
            break;
        }
      } else if (message.type === "broadcast") {
        notifyConnectedClients(message.data || message);

        sendResponse({
          status: "success",
          message: "Message broadcasted successfully",
          clientsCount: connectedPorts.size,
        });
      } else {
        console.warn("Message has neither source nor type");
        sendResponse({ status: "error", message: "Invalid message format" });
      }
    } else {
      console.warn("Message from unauthorized domain:", sender.url);
      sendResponse({ status: "error", message: "Unauthorized domain" });
    }

    return true;
  }
);

const FREE_REQUESTS_LIMIT = 10;
const REQUEST_COUNT_KEY = "summaryRequestCount";

async function getStoredValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[key]);
      }
    });
  });
}
async function getRequestCount() {
  return (await getStoredValue(REQUEST_COUNT_KEY)) || 0;
}

async function incrementRequestCount() {
  let count = await getRequestCount();
  count++;
  await saveToStorage(REQUEST_COUNT_KEY, count);
  return count;
}

/**
 * Запрашивает данные пейвола из Popup с таймаутом.
 * @param {number} timeoutMs Таймаут в миллисекундах.
 * @returns {Promise<Object|null>} Объект с данными пейвола (tier, paid, country, paywallId) или null в случае ошибки/таймаута.
 */
async function getPaywallInfoFromPopup(timeoutMs = 8000) {
  try {
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "requestPaywallData" }, (res) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (!res || !res.paywallData) {
            reject(
              new Error(
                "Popup did not return paywallData or the response is empty."
              )
            );
          } else {
            resolve(res.paywallData);
          }
        });
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Paywall data request timeout")),
          timeoutMs
        )
      ),
    ]);
    return response;
  } catch (error) {
    console.warn(
      "Error getting paywall data from popup (or timeout):",
      error.message
    );
    return null;
  }
}

/**
 * Открывает пейвол через Popup. Возвращает промис, который разрешается,
 * как только сообщение об открытии отправлено (или истек таймаут),
 * не дожидаясь фактического закрытия/оплаты пейвола.
 * @returns {Promise<boolean>} True, если сообщение об открытии пейвола было отправлено.
 */
async function triggerPaywallOpen(timeoutMs = 8000) {
  try {
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "openPaywall" }, (res) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(res);
          }
        });
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Trigger paywall open timeout")),
          timeoutMs
        )
      ),
    ]);
    if (!response.success) {
      console.warn("Failed to trigger paywall open:", response.error);
    }
    return response.success;
  } catch (error) {
    console.warn("Error triggering paywall open (or timeout):", error.message);
    return false; // Возвращаем false, если не удалось даже инициировать открытие
  }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (
    request.action === "getSummary" ||
    request.action === "getSummaryArticle"
  ) {
    const settings = await getSettings();
    const tone = request.tone || "facile";
    sendSummary(request.pageContent, request.input_type, settings, tone);
  }
  if (request.action === "translateText") {
    fetchTranslation(request.text, request.language);
  }
  return true;
});

function fetchTranslation(text, language) {
  const url = "http://158.160.66.115:40000/translate";

  const data = {
    text: text,
    lang: language,
  };

  fetch(url, {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        return response
          .json()
          .then((errorData) => {
            // Если сервер отправил ошибку в JSON формате
            throw new Error(`Server error: ${errorData.message}`);
          })
          .catch(() => {
            // Если ошибка не в формате JSON
            throw new Error(
              `Server responded with ${response.status}: ${response.statusText}`
            );
          });
      }
      return response.text();
    })
    .then((translatedText) => {
      chrome.runtime.sendMessage({
        action: "translationResult",
        translation: translatedText,
      });
    })
    .catch((error) => {
      console.error("Ошибка перевода: ", error);
      chrome.runtime.sendMessage({
        action: "translationError",
        message: error.message,
      });
    });
}

async function getSettings() {
  const keysToGet = [
    "apiKey",
    "uniqueUserId",
    "userPreferredEngine",
    "summaryLength",
    "userPreferredTone",
  ];
  let result = {};
  try {
    result = await new Promise((resolve, reject) => {
      chrome.storage.local.get(keysToGet, function (result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    if (!result.uniqueUserId) {
      result.uniqueUserId = await generateUniqueId();
      await saveToStorage("uniqueUserId", result.uniqueUserId);
    }
  } catch (error) {
    console.error("Error getting settings:", error);

    if (!result.uniqueUserId) {
      result.uniqueUserId = await generateUniqueId();
      await saveToStorage("uniqueUserId", result.uniqueUserId);
    }
  }

  return {
    apiKey: result.apiKey || null,
    uniqueUserID: result.uniqueUserId,
    userPreferredEngine: "gpt-3.5-turbo",
    summaryLength: result.summaryLength,
    userPreferredTone: result.userPreferredTone || "facile",
    activeTabURL: await getActiveTabURL(),
  };
}

async function sendSummary(pageContent, inputType, settings, tone) {
  let currentFreeRequestCount = await incrementRequestCount();

  if (currentFreeRequestCount > FREE_REQUESTS_LIMIT) {
    triggerPaywallOpen()
      .then((success) => {
        if (!success) {
          console.warn(
            "Could not initiate paywall open. Continuing request as free."
          );
        }
      })
      .catch((err) => {
        console.error("Error during triggerPaywallOpen promise chain:", err);
      });
  }

  const paywallInfo = await getPaywallInfoFromPopup();

  let dataToSend = {
    content: pageContent,
    input_type: inputType,
    user: settings.uniqueUserID,
    engine: "gpt-3.5-turbo",
    length: settings.summaryLength,
    tone: tone || settings.userPreferredTone || "facile",
  };

  if (settings.apiKey) {
    dataToSend.api_key = settings.apiKey;
  }

  if (settings.activeTabURL) {
    dataToSend.page_link = settings.activeTabURL;
  }

  if (paywallInfo) {
    dataToSend.paywall_tier =
      paywallInfo.tier !== undefined ? paywallInfo.tier.toString() : "0";
    dataToSend.paywall_paid =
      paywallInfo.paid !== undefined ? paywallInfo.paid.toString() : "false";
    dataToSend.paywall_country =
      paywallInfo.country !== undefined ? paywallInfo.country : "";
  } else {
    console.warn("User info not available or timed out.");
  }

  setupWebSocket(dataToSend);
}
// function sendSummary(pageContent, inputType, settings) {
//   // ... внутри sendSummary, когда нужно открыть пейвол
//   //chrome.runtime.sendMessage({ action: "openPaywall" });
//   //const paywallInfo = await getPaywallInfoFromPopup();
//   const {
//     uniqueUserID,
//     userPreferredEngine,
//     activeTabURL,
//     apiKey,
//     summaryLength,
//   } = settings;
//   setupWebSocket(
//     pageContent,
//     inputType,
//     uniqueUserID,
//     userPreferredEngine,
//     activeTabURL,
//     apiKey,
//     summaryLength
//   );
// }

let webSocketConnection = null;
let connectedPort = null;

chrome.runtime.onConnect.addListener((portInstance) => {
  if (portInstance.name === "popup") {
    connectedPort = portInstance;

    connectedPort.onDisconnect.addListener(() => {
      connectedPort = null;
    });
  }
});

// function setupWebSocket(
//   pageContent,
//   inputType,
//   uniqueUserID,
//   userPreferredEngine,
//   activeTabURL,
//   apiKey,
//   summaryLength
// ) {
//   webSocketConnection = new WebSocket("ws://158.160.66.115:40000/summary");
//   webSocketConnection.onopen = () => {
// let dataToSend = {
//   content: pageContent,
//   input_type: inputType,
//   user: uniqueUserID,
//   engine: userPreferredEngine,
//   page_link: activeTabURL,
//   length: summaryLength, //parseInt(summaryLength, 10)
// };

// if (apiKey) {
//   dataToSend.api_key = apiKey;
// }
// if (activeTabURL) {
//   dataToSend.page_link = activeTabURL;
// }

//   webSocketConnection.send(JSON.stringify(dataToSend));
// };

function setupWebSocket(dataToSend) {
  webSocketConnection = new WebSocket("ws://158.160.66.115:40000/summary");

  webSocketConnection.onopen = () => {
    webSocketConnection.send(JSON.stringify(dataToSend));
  };

  webSocketConnection.onmessage = (event) => {
    try {
      let jsonData = JSON.parse(event.data);
      // Если мы здесь, значит данные - JSON
      if (jsonData.type === "error") {
        if (connectedPort) {
          connectedPort.postMessage({
            action: "error",
            error: jsonData.error,
          });
        }
      } else {
        // Обрабатываем JSON данные
        if (connectedPort) {
          connectedPort.postMessage({
            action: "streamingData",
            data: jsonData,
          });
        }
      }
    } catch (e) {
      // Если ошибка парсинга, значит данные - обычный текст
      if (typeof event.data === "string") {
        if (connectedPort) {
          connectedPort.postMessage({
            action: "streamingData",
            data: event.data,
          });
        }
      } else {
        // Если данные не строка и не JSON, это нечто неожиданное
        console.error("data:", event.data);
        if (connectedPort) {
          connectedPort.postMessage({
            action: "error",
            reason:
              "Попробуйте уменьшить количество текста или увеличить ваш лимит токенов.",
          });
        }
      }
    }
  };

  webSocketConnection.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  webSocketConnection.onclose = (event) => {
    if (!event.wasClean || (event.code >= 1002 && event.code <= 1014)) {
      console.error("WebSocket connection died");

      if (connectedPort) {
        connectedPort.postMessage({
          action: "connectionClosed",
          reason: "No response from the server.",
        });
      }
    } else {
      console.log(`Connection closed cleanly, code=${event.code}`);
    }

    // Сброс соединения и подготовка к новому подключению
    webSocketConnection = null;
  };
}

function closeWebSocketConnection() {
  if (webSocketConnection) {
    webSocketConnection.close(); // Закрываем соединение
    webSocketConnection = null; // Обнуляем глобальную переменную
  }
}

async function getActiveTabURL() {
  try {
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabs);
        }
      });
    });

    if (tabs && tabs.length > 0) {
      return tabs[0].url;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}
async function generateUniqueId() {
  return new Promise((resolve, reject) => {
    let uniqueUserId = self.crypto.randomUUID();
    resolve(uniqueUserId);
  });
}
