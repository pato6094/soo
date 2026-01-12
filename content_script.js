chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "ping") {
    sendResponse({ status: "ok" });
    return true;
  }
  if (request.action === "getSummaryAllPage") {
    let isGoogleDocs =
      /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation|forms|drawings)/.test(
        window.location.href
      );

    if (isGoogleDocs) {
      alert(
        "To summarize text from Google Docs, please copy the text manually and paste it into the extension."
      );
    } else {
      const pageContent = document.body.innerText;
      //pageContent.length <= maxLength
      chrome.runtime.sendMessage({
        action: "getSummary",
        pageContent: pageContent,
        input_type: "page",
      });
    }
  }
  if (request.action === "reloadConfirmation") {
    const reloadPage = confirm(
      'This page needs to be reloaded for the extension to work properly. Click "OK" to reload the page.'
    );

    if (reloadPage) {
      location.reload();
    }
  }
});

// --------------Rate us-----------------

// if (
//   document.location.href.includes(
//     "https://chrome.google.com/webstore/detail/краткий-пересказ-страницы/npifianbfjhobabjjpfdjjihgbdnbojh?hl=ru&authuser=0"
//   )
// ) {
//   const reviewSpan = document.querySelector(".P3rABb");
//   console.log("Есть элемент");

//   if (reviewSpan) {
//     reviewSpan.scrollIntoView();
//     reviewSpan.style.background = "red";
//   }
// }
