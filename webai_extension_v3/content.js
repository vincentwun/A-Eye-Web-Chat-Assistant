chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageInfo") {
      const totalHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight,
          document.body.clientHeight,
          document.documentElement.clientHeight
      );
      const viewportHeight = window.innerHeight;
      sendResponse({ totalHeight, viewportHeight });
  } else if (request.action === "scrollTo") {
      window.scrollTo(0, request.position);
      sendResponse({ status: "scrolled" });
  } else if (request.action === "scrollToTop") {
      window.scrollTo(0, 0);
      sendResponse({ status: "scrolledToTop" });
  }
});