const PAYWALL_ID = "581";
document.addEventListener("DOMContentLoaded", async function () {
  const btnPopupClose = document.getElementById("btnPopupClose");
  //--article
  const sectionArticle = document.getElementById("section-article");
  const articleInput = document.getElementById("section-article__input");
  const btnArticleSubmit = document.getElementById("btnArticleSubmit");
  const btnClearArticle = document.getElementById("btnClearArticle");
  //--getSummary
  const sectionButtons = document.getElementById("sectionButtons");
  const pretextOr = document.getElementById("pretextOr");
  const getSummaryButton = document.getElementById("getSummary");
  const btnSummaryStop = document.getElementById("btnSummaryStop");
  //--output
  const summaryOutput = document.getElementById("summaryOutput");
  const summaryTextarea = document.getElementById("summaryTextarea");
  const btnClearSummary = document.getElementById("btnClearSummary");

  //--progress
  const progress = document.getElementById("progress");
  const progressLine = document.getElementById("progressLine");
  //--functionality
  const sectionFunctionalityButtons = document.querySelector(
    ".section-functionality__buttons"
  );
  const increaseBtn = document.getElementById("section-summary__button-plus");
  const decreaseBtn = document.getElementById("section-summary__button-minus");
  const btnAudio = document.getElementById("btnAudio");
  const btnCopySummary = document.getElementById("btnCopySummary");
  //--rating
  const APPRAISAL_INTERVAL = 9;
  const ratingLinkOpenBtn = document.getElementById("ratingLinkOpenBtn");
  const ratingCloseBtn = document.querySelector(".rating__close-btn");
  const ratingWrapper = document.querySelector(".rating__wrapper");
  const ratingPositiveAnswer = document.getElementById("ratingPositiveAnswer");
  const ratingNegativeAnswer = document.getElementById("ratingNegativeAnswer");
  //--api key
  const modelSelect = document.getElementById("modelSelect");
  const keyInputContainer = document.getElementById("keyInputContainer");
  const openAIApiKey = document.getElementById("openAIApiKey");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  //-----translate-----------
  const summaryLengthSection = document.querySelector(
    ".summary-length__section"
  );
  const summaryLengthRange = document.getElementById("summaryLengthRange");
  const languageSelect = document.querySelector(".language-select");
  // Глобальная переменная для отслеживания видимости summaryTextarea
  let isSummaryTextareaVisible = true;

  let summaryReceived = false;
  let isSpeaking = false;
  await initializeModelSelect();
  await showRatingBlockIfNeeded();
  //----------------showRating -----------------

  async function showRatingBlockIfNeeded() {
    try {
      const { hasAlreadyBeenGraded, userRating, answersReceived } =
        await getStorageData([
          "hasAlreadyBeenGraded",
          "userRating",
          "answersReceived",
        ]);

      if (!hasAlreadyBeenGraded && answersReceived % APPRAISAL_INTERVAL === 0) {
        displayRatingBlock();
      }
    } catch (error) {
      console.error("Не удалось получить информацию об оценке: ", error);
    }
  }

  async function getStorageData(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, function (result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  function displayRatingBlock() {
    ratingWrapper.style.display = "flex";
    const ratingBlock = document.getElementById("ratingBlock");
    const ratingStars = ratingBlock.querySelectorAll(".rating-star");

    ratingStars.forEach((star) => {
      star.addEventListener("click", function () {
        const rating = parseInt(star.getAttribute("data-rating"));
        setUserHasRated(rating);
        ratingLinkOpenBtn.style.display = "flex";
        // Убрать выбранный класс и цвет заливки у всех звезд
        ratingStars.forEach((s) => {
          s.classList.remove("selected");
          s.querySelectorAll("path").forEach((path) => {
            path.setAttribute("fill", "white");
          });
        });

        // Добавление выбранному классу и изменение цвета заливки для звезд от 1 до выбранной
        for (let i = 0; i < rating; i++) {
          ratingStars[i].classList.add("selected");
          ratingStars[i].querySelectorAll("path").forEach((path) => {
            path.setAttribute("fill", "#F0C419"); // Золотой цвет
          });
        }
      });
    });
  }

  ratingLinkOpenBtn.addEventListener("click", async function () {
    const { userRating } = await getStorageData(["userRating"]);
    if (userRating >= 4) {
      // Пользователь дал высокий рейтинг
      ratingPositiveAnswer.style.display = "flex";
    } else {
      // Пользователь дал низкий рейтинг
      ratingNegativeAnswer.style.display = "flex";
    }

    ratingLinkOpenBtn.style.display = "none";
  });

  ratingCloseBtn.addEventListener("click", async function () {
    ratingPositiveAnswer.style.display = "none";
    ratingNegativeAnswer.style.display = "none";
    ratingWrapper.style.display = "none";
    ratingCloseBtn.style.display = "none";
  });

  function setUserHasRated(rating) {
    chrome.storage.local.set(
      { hasAlreadyBeenGraded: true, userRating: rating, answersReceived: 0 },
      function () {
        if (chrome.runtime.lastError) {
          console.error(
            "Ошибка при сохранении статуса оценки: ",
            chrome.runtime.lastError
          );
        }
      }
    );
  }

  function incrementAnswersReceived() {
    chrome.storage.local.get(["answersReceived"], function (result) {
      const currentCount = Number(result.answersReceived) || 0;
      chrome.storage.local.set(
        { answersReceived: currentCount + 1 },
        function () {
          if (chrome.runtime.lastError) {
            console.error(
              "Ошибка при увеличении answersReceived:",
              chrome.runtime.lastError
            );
          }
        }
      );
    });
  }

  //--------------------------------------------
  async function checkAndInjectContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "ping" });
      return true;
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content_script.js"],
      });
      return false;
    }
  }
  //---------------pendingSummary----
  function pendingResponse() {
    summaryOutput.style.display = "flex";
    summaryTextarea.textContent = "";
    summaryLengthSection.style.display = "none";
    btnClearSummary.style.display = "none";
    showProgress();
    getSummaryButton.style.backgroundColor = "#8E8E93";
    sectionFunctionalityButtons.style.display = "none";
  }

  //----------------article--------------
  function handleInputEvent() {
    const textContent = articleInput.value.trim();
    btnClearArticle.style.display = textContent !== "" ? "flex" : "none";
    btnArticleSubmit.style.display = textContent !== "" ? "flex" : "none";
    sectionButtons.style.display = textContent === "" ? "flex" : "none";
    // Авто-регулируем высоту textarea.
    articleInput.style.height = "auto";
    articleInput.style.height = `${articleInput.scrollHeight}px`;
  }

  articleInput.addEventListener("input", handleInputEvent);
  articleInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault(); // предотвращаем срабатывание по умолчанию (перенос строки, если это <textarea>)
      submitArticle();
    }
  });

  handleInputEvent.call(articleInput);

  function clearArticleInput() {
    articleInput.value = "";
    handleInputEvent.call(articleInput);
    articleInput.style.display = "flex";
  }
  btnClearArticle.addEventListener("click", clearArticleInput);

  function submitArticle() {
    const copiedText = articleInput.value.trim();
    if (copiedText) {
      chrome.runtime.sendMessage({
        action: "getSummaryArticle",
        pageContent: copiedText,
        input_type: "text",
      });
      pendingResponse();
      sectionButtons.style.display = "none";
      btnArticleSubmit.style.display = "none";
      btnArticleSubmit.disabled = true;
      btnClearArticle.style.display = "none";
      articleInput.style.display = "none";
      articleInput.textContent = "";

      incrementAnswersReceived();
    }
  }

  btnArticleSubmit.addEventListener("click", submitArticle);

  //----------------------Page Summary-----------
  getSummaryButton.addEventListener("click", async function () {
    try {
      pendingResponse();
      getSummaryButton.style.backgroundColor = "#8E8E93"; // серый
      getSummaryButton.disabled = true;
      sectionArticle.style.display = "none";
      pretextOr.style.display = "none";
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const isInjected = await checkAndInjectContentScript(tab.id);
      if (!isInjected) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await chrome.tabs.sendMessage(tab.id, {
        action: "getSummaryAllPage",
      });
      incrementAnswersReceived();
    } catch (error) {
      hideProgress();
    }
  });

  // Инициализация пейвола
  async function initPaywall() {
    if (!window.paywall) {
      console.error("Paywall script not loaded in popup.");
      return null;
    }
    try {
      await window.paywall.init(PAYWALL_ID, null, document);
      return true;
    } catch (error) {
      console.error("Error initializing paywall in popup:", error);
      return null;
    }
  }

  // Функция для получения данных пользователя из пейвола
  async function getPaywallUserData() {
    if (!window.paywall || !window.paywall.isInitialized) {
      const initialized = await initPaywall();
      if (!initialized) {
        console.warn("Could not re-initialize paywall for getUserData.");
        return null;
      }
    }
    try {
      const userData = await window.paywall.getUser();
      return {
        tier: userData.tier,
        paid: userData.paid,
        country: userData.country,
      };
    } catch (error) {
      console.error("Error getting paywall user data:", error);
      return null;
    }
  }

  //----------------
  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse
  ) {
    if (request.action === "translationResult") {
      updateInterfaceForData();
      summaryTextarea.textContent = request.translation;
      // sectionFunctionalityButtons.style.display = "flex";
    } else if (request.action === "translationError") {
      updateInterfaceForData();
      summaryTextarea.textContent = request.message;
      // sectionFunctionalityButtons.style.display = "flex";
    }
    if (request.action === "requestPaywallData") {
      // background.js запросил данные пейвола
      getPaywallUserData()
        .then((paywallData) => {
          sendResponse({ paywallData: paywallData });
        })
        .catch((error) => {
          console.error("Error sending paywall data to background:", error);
          sendResponse({ paywallData: null, error: error.message });
        });
      return true;
    } else if (request.action === "openPaywall") {
      if (window.paywall && window.paywall.open) {
        window.paywall.open();
        sendResponse({
          success: true,
          message: "Paywall opened successfully.",
        });
      } else {
        console.error("Paywall API for 'open' not available.");
        sendResponse({ success: false, error: "Paywall API not available." });
      }
      return true;
    }
  });

  let port = chrome.runtime.connect({ name: "popup" });
  let messageQueue = [];
  let appendingInProgress = false;
  let currentText = "";
  let currentIndex = 0;
  let appendTimeout;

  function clearTimeoutIfNeeded() {
    if (appendTimeout) {
      clearTimeout(appendTimeout);
      appendTimeout = null;
    }
  }
  function appendCharByChar() {
    if (!appendingInProgress) {
      if (messageQueue.length > 0) {
        currentText += messageQueue.shift(); // Добавляем следующую часть текста
        if (!appendingInProgress) {
          // Начинаем процесс, если он не был начат
          currentIndex = 0;
          appendingInProgress = true;
          clearTimeoutIfNeeded(); // Очищаем предыдущий тайм-аут
          appendNextChar();
        }
      }
    }
  }

  function appendNextChar() {
    if (currentIndex < currentText.length) {
      summaryTextarea.textContent += currentText[currentIndex++];
      // summaryTextarea.scrollTop = summaryTextarea.scrollHeight;
      appendTimeout = setTimeout(appendNextChar, 15);
    } else {
      currentText = "";
      appendingInProgress = false;
      clearTimeoutIfNeeded();
      if (messageQueue.length > 0) {
        appendCharByChar();
      }
      if (messageQueue.length === 0) {
        btnSummaryStop.style.display = "none";
        if (isSummaryTextareaVisible) {
          sectionFunctionalityButtons.style.display = "flex";
        }
      }
    }
  }

  port.onMessage.addListener(function (message) {
    switch (message.action) {
      case "streamingData":
        updateInterfaceForData();
        btnSummaryStop.style.display = "flex";
        messageQueue.push(message.data);
        appendCharByChar();
        sectionFunctionalityButtons.style.display = "none"; // Убедись, что это здесь или в updateInterfaceForData
        break;
      case "error":
        updateInterfaceForData();
        btnSummaryStop.style.display = "flex";
        summaryTextarea.textContent = message.error.message;
        break;
      case "connectionClosed":
        updateInterfaceForData();
        btnSummaryStop.style.display = "flex";
        summaryTextarea.textContent = message.reason;
        break;
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
  });

  function updateInterfaceForData() {
    hideProgress();
    summaryOutput.style.display = "flex";
    sectionArticle.style.display = "none";
    summaryReceived = true;
    btnClearSummary.style.display = "flex";
    sectionButtons.style.display = "none";
  }

  btnSummaryStop.addEventListener("click", function () {
    messageQueue = [];
    currentText = "";
    currentIndex = 0;
    appendingInProgress = false;
    clearTimeout(appendTimeout);
    btnSummaryStop.style.display = "none";
    sectionFunctionalityButtons.style.display = "flex";
  });

  btnCopySummary.addEventListener("click", copyToClipboard);

  //---------------------------------
  function copyToClipboard() {
    const summaryText = document.getElementById("summaryTextarea");
    const range = document.createRange();
    range.selectNode(summaryText);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    try {
      navigator.clipboard.writeText(window.getSelection().toString());

      window.getSelection().removeAllRanges();
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  }

  //------------------Audio------------------
  btnAudio.addEventListener("click", () => {
    if (!isSpeaking) {
      if (summaryReceived) {
        chrome.tts.speak(cleanText(summaryOutput.innerText), {
          onEvent: function (event) {
            if (event.type === "end") {
              isSpeaking = false;
            }
          },
        });
        isSpeaking = true;
        btnAudio.classList.remove("button-audio-stopped");
        btnAudio.classList.add("button-audio-sounds");
      }
    } else {
      chrome.tts.stop();
      isSpeaking = false;
      btnAudio.classList.remove("button-audio-sounds");
      btnAudio.classList.add("button-audio-stopped");
    }
  });

  function cleanText(text) {
    return text
      .replace(/[\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // btnAudio.addEventListener("click", () => {
  //   if (!isSpeaking) {
  //     if (summaryReceived) {
  //       // Указываем язык голосового движка, например, американский английский
  //       const speakOptions = {
  //         lang: "en-US", // Пример языкового тега
  //         onEvent: function (event) {
  //           if (event.type === "end") {
  //             isSpeaking = false;
  //           }
  //         },
  //       };

  //       // выбрать язык текста в настройках интерфейса
  //       // сохранить язык в storage
  //       const currentLanguage = "ru";
  //       speakOptions.lang = currentLanguage;

  //       chrome.tts.speak(cleanText(summaryOutput.innerText), speakOptions);
  //       isSpeaking = true;
  //       btnAudio.classList.remove("button-audio-stopped");
  //       btnAudio.classList.add("button-audio-sounds");
  //     }
  //   } else {
  //     chrome.tts.stop();
  //     isSpeaking = false;
  //     btnAudio.classList.remove("button-audio-sounds");
  //     btnAudio.classList.add("button-audio-stopped");
  //   }
  // });

  // Для автоматического определения языка, к сожалению, в самой Chrome API TTS нет встроенных средств. Вам может потребоваться подключить внешние библиотеки или API, например, franc, compromise, langdetect или подобные, доступные в npm или других источниках, если вы используете сборку с помощью Webpack или других средств для работы с модулями.

  //------------------------------------------------

  btnClearSummary.addEventListener("click", async function () {
    messageQueue = [];
    currentText = "";
    currentIndex = 0;
    appendingInProgress = false;
    summaryTextarea.textContent = "";
    getSummaryButton.disabled = false;
    btnArticleSubmit.disabled = false;
    getSummaryButton.style.backgroundColor = "#30B0C7";
    btnArticleSubmit.style.backgroundColor = "#30B0C7";
    btnClearSummary.style.display = "none";
    summaryOutput.style.display = "none";
    sectionArticle.style.display = "flex";
    sectionButtons.style.display = "flex";
    pretextOr.style.display = "flex";
    isSummaryTextareaVisible = false;
    summaryLengthSection.style.display = "flex";
    clearArticleInput();
    chrome.tts.stop();
    // Показать блок рейтинга, если необходимо
    await showRatingBlockIfNeeded();
    sectionFunctionalityButtons.style.display = "none";
  });

  //------------keyInputContainer----------

  async function shouldShowKeyInput(selectedModel) {
    const previousModel = await new Promise((resolve, reject) => {
      chrome.storage.local.get(["previousEngine"], function (result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.previousEngine || "gpt-3.5-turbo");
        }
      });
    });

    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ previousEngine: selectedModel }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    return selectedModel === "gpt-4" && previousModel !== "gpt-4";
  }
  // async function shouldShowKeyInput(selectedModel) {
  //   return selectedModel === "gpt-4"; // Показывать окно, если выбран gpt-4
  // }
  modelSelect.addEventListener("change", async () => {
    const selectedModel = modelSelect.value;
    const isShowKeyInput = await shouldShowKeyInput(selectedModel);

    if (isShowKeyInput) {
      await showKeyInput();
    } else {
      hideKeyInput();
    }

    await saveModelPreference(selectedModel);
  });

  saveKeyBtn.addEventListener("click", async () => {
    try {
      const apiKeyValue = openAIApiKey.value;
      await saveApiKey(apiKeyValue);
      const selectedModel = apiKeyValue ? "gpt-4" : "gpt-3.5-turbo";
      await saveModelPreference(selectedModel);
      modelSelect.value = selectedModel;
      hideKeyInput();
    } catch (error) {
      console.error("Error when saving OpenAI APIKey:", error);
    }
  });
  async function getApiKey() {
    try {
      const promise = new Promise((resolve, reject) => {
        chrome.storage.local.get(["apiKey"], function (result) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError));
          } else {
            resolve(result.apiKey);
          }
        });
      });

      const apiKey = await promise;
      if (apiKey) {
        return apiKey;
      }
    } catch (error) {
      console.error("Error when receiving OpenAI API Key:", error);
      return "";
    }
  }
  async function saveApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ apiKey: apiKey }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async function showKeyInput() {
    keyInputContainer.style.display = "flex";
    try {
      const apiKey = await getApiKey();
      openAIApiKey.value = apiKey || "";
      openAIApiKey.focus();
    } catch (error) {
      openAIApiKey.value = "";
    }
  }

  function hideKeyInput() {
    keyInputContainer.style.display = "none";
    openAIApiKey.value = "";
  }

  async function saveModelPreference(engine) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ userPreferredEngine: engine }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async function initializeModelSelect() {
    try {
      const modelPreference = await new Promise((resolve, reject) => {
        chrome.storage.local.get(["userPreferredEngine"], function (result) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result.userPreferredEngine || "gpt-3.5-turbo");
          }
        });
      });

      modelSelect.value = modelPreference;

      hideKeyInput();
    } catch (error) {
      console.error("Ошибка при инициализации modelSelect:", error);
    }
  }

  document
    .getElementById("btnCloseInputContainer")
    .addEventListener("click", async () => {
      keyInputContainer.style.display = "none";

      const apiKey = await getApiKey();
      if (!apiKey && modelSelect.value === "gpt-4") {
        modelSelect.value = "gpt-3.5-turbo";
        await saveModelPreference("gpt-3.5-turbo");
      }
    });
  // --------PopupClose---------------------
  btnPopupClose.addEventListener("click", function () {
    chrome.tts.stop();
    window.close();
  });

  //----------------translate to-------------
  languageSelect.addEventListener("change", function () {
    const selectedLanguage = languageSelect.value;
    const text = summaryTextarea.innerText.trim();

    if (selectedLanguage !== "default" && text) {
      pendingResponse();
      chrome.runtime.sendMessage({
        action: "translateText",
        text: text,
        language: selectedLanguage,
      });
      languageSelect.value = "default";
    }
  });
  //----------------increase-decrease----------------------------
  let currentFontSize = 16;
  increaseBtn.addEventListener("click", () => {
    currentFontSize += 1;
    summaryTextarea.style.fontSize = `${currentFontSize}px`;
  });

  decreaseBtn.addEventListener("click", () => {
    currentFontSize -= 1;
    summaryTextarea.style.fontSize = `${currentFontSize}px`;
  });

  //-------progress---------
  function showProgress() {
    progress.style.display = "flex";
    progressLine.classList.remove("complete");
    progressLine.classList.add("progress-animation");
  }
  function hideProgress() {
    progress.style.display = "none";
    progressLine.classList.add("complete");
  }

  //------------------summaryLength----------------------------
  const rangeValue = document.getElementById("rangeValue");

  // Функция для обновления позиции и значения элемента "rangeValue"
  function updateRangeValue(slider, valueElement) {
    const value = slider.value;
    const min = parseInt(slider.min, 10);
    const max = parseInt(slider.max, 10);
    const percent = (value - min) / (max - min);

    const trackWidth = 240;
    const thumbWidth = 16;
    const effectiveTrackWidth = trackWidth - thumbWidth;

    const offset = percent * effectiveTrackWidth;

    valueElement.textContent = value;
    valueElement.style.left = `${offset + thumbWidth / 2}px`;
  }

  chrome.storage.local.get(["summaryLength"], function (result) {
    if (result.hasOwnProperty("summaryLength")) {
      summaryLengthRange.value = result.summaryLength;
      updateRangeValue(summaryLengthRange, rangeValue);
    }
  });

  summaryLengthRange.addEventListener("input", function () {
    updateRangeValue(this, rangeValue);

    const length = Number(this.value);
    chrome.storage.local.set({ summaryLength: length }, function () {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to save the value summaryLength: ",
          chrome.runtime.lastError
        );
      }
    });
  });

  initPaywall();
});
