// Emulates the Google Apps Script client API (google.script.run) on top of
// fetch() calls to the Rails backend, so the original client code runs
// unchanged: google.script.run.withSuccessHandler(cb).fnName(args...)
// becomes POST /api/fnName with {args: [...]}.
(function () {
  function makeRunner(handlers) {
    return new Proxy({}, {
      get: function (_target, prop) {
        if (prop === "withSuccessHandler")
          return function (fn) { return makeRunner(Object.assign({}, handlers, { success: fn })); };
        if (prop === "withFailureHandler")
          return function (fn) { return makeRunner(Object.assign({}, handlers, { failure: fn })); };
        if (prop === "withUserObject")
          return function (obj) { return makeRunner(Object.assign({}, handlers, { userObject: obj })); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch("/api/" + String(prop), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ args: args })
          })
            .then(function (r) {
              return r.json().catch(function () { return null; }).then(function (data) {
                if (!r.ok || (data && typeof data === "object" && data.error))
                  throw new Error((data && data.error) || ("HTTP " + r.status));
                (handlers.success || function () {})(data, handlers.userObject);
              });
            })
            .catch(function (e) {
              (handlers.failure || function (err) { console.error(err); })(e, handlers.userObject);
            });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner({});
})();
