// QOR AI Admin - Score Engine worker.
// Keeps expensive category scoring off the browser UI thread.
(function () {
  'use strict';

  let loadError = null;
  try {
    importScripts('score_engine.js?v=20260531-score-worker');
  } catch (error) {
    loadError = error && error.message ? error.message : String(error);
  }

  self.onmessage = function (ev) {
    const payload = ev.data || {};
    try {
      if (loadError) throw new Error(loadError);
      if (!self.ScoreEngine || typeof self.ScoreEngine.scoreCategory !== 'function') {
        throw new Error('ScoreEngine is not available in worker');
      }
      const scored = self.ScoreEngine.scoreCategory(payload.products || []);
      self.postMessage({
        requestId: payload.requestId,
        ok: true,
        scored: scored || [],
      });
    } catch (error) {
      self.postMessage({
        requestId: payload.requestId,
        ok: false,
        error: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : '',
      });
    }
  };
})();
