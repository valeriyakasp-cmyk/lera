/**
 * Additions that only apply to the hosted build. They sit alongside the app
 * and never touch its markup, styles or logic.
 *
 *  1. Home-screen install support, so the page opens fullscreen with its own
 *     icon and behaves like an installed app.
 *  2. A request for persistent storage. Browsers evict ordinary site data
 *     after a period of disuse; installed web apps that hold this grant are
 *     exempt, which is what keeps the saved data around.
 *  3. Backup and restore, so the data can be moved between devices and is
 *     never trapped in one browser.
 */
(function () {
  "use strict";

  var BRAND = "#29ADE1";
  var BACKDROP = "#EDF0F6";

  // The app keeps everything under these keys; bizflow_v3_data holds the state.
  var KEYS = [
    "bizflow_v3_data",
    "bizflow_v3_saved_at",
    "bizflow_fab_pos",
    "bizflow_usd_rate",
  ];

  function meta(name, content) {
    var el = document.createElement("meta");
    el.setAttribute("name", name);
    el.setAttribute("content", content);
    document.head.appendChild(el);
  }

  /** Draws the home-screen icon rather than shipping a binary for it. */
  function installIcon() {
    try {
      var size = 180;
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext("2d");
      if (!ctx) return;

      var sky = ctx.createLinearGradient(0, 0, 0, size);
      sky.addColorStop(0, "#FAFBFE");
      sky.addColorStop(1, "#DCEBFA");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = BRAND;
      ctx.font = "600 104px 'Assistant', -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₪", size / 2, size / 2 + 6);

      var link = document.createElement("link");
      link.rel = "apple-touch-icon";
      link.setAttribute("href", canvas.toDataURL("image/png"));
      document.head.appendChild(link);
    } catch (err) {
      /* An icon is a nicety; never let it stop the app. */
    }
  }

  function installAppMetas() {
    meta("apple-mobile-web-app-capable", "yes");
    meta("mobile-web-app-capable", "yes");
    meta("apple-mobile-web-app-status-bar-style", "default");
    meta("apple-mobile-web-app-title", "BizFlow");
    meta("theme-color", BACKDROP);
    installIcon();
  }

  function requestDurableStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(function () {});
      }
    } catch (err) {
      /* Not supported everywhere; the app still works without the grant. */
    }
  }

  function collectBackup() {
    var data = {};
    for (var i = 0; i < KEYS.length; i++) {
      var value = localStorage.getItem(KEYS[i]);
      if (value !== null) data[KEYS[i]] = value;
    }
    return JSON.stringify(
      { app: "bizflow", version: 1, savedAt: new Date().toISOString(), data: data },
      null,
      2,
    );
  }

  function backupFilename() {
    var d = new Date();
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      "bizflow-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json"
    );
  }

  /** Falls back to an ordinary download when the host offers no save. */
  function saveViaAnchor(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function runBackup(say) {
    var text = collectBackup();
    var name = backupFilename();
    var host = window.claude && window.claude.downloads;

    if (!host) {
      saveViaAnchor(name, text);
      say("הגיבוי ירד.");
      return;
    }

    host
      .save({ filename: name, data: text })
      .then(function () {
        say("הגיבוי נשמר.");
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === "declined") return;
        if (code === "rate_limited") {
          say("רגע ונסי שוב.");
          return;
        }
        // Anything else means the host save is unusable here.
        saveViaAnchor(name, text);
        say("הגיבוי ירד.");
      });
  }

  function applyRestore(parsed) {
    if (!parsed || parsed.app !== "bizflow" || !parsed.data || !parsed.data.bizflow_v3_data) {
      throw new Error("not a BizFlow backup");
    }
    // Prove the payload parses before touching anything already stored.
    JSON.parse(parsed.data.bizflow_v3_data);

    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
        localStorage.setItem(key, parsed.data[key]);
      }
    }
    // The snapshot the app keeps in IndexedDB would otherwise win on reload.
    try {
      indexedDB.deleteDatabase("bizflow_storage");
    } catch (err) {
      /* Best effort; localStorage still carries the restored data. */
    }
  }

  function runRestore(say) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.remove();
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyRestore(JSON.parse(String(reader.result)));
          location.reload();
        } catch (err) {
          say("הקובץ אינו גיבוי תקין.");
        }
      };
      reader.onerror = function () {
        say("לא הצלחתי לקרוא את הקובץ.");
      };
      reader.readAsText(file);
    });

    input.click();
  }

  function buildControl() {
    var wrap = document.createElement("div");
    // The wrapper stays left-to-right so its alignment does not depend on the
    // page direction; the menu below sets rtl for its own text. Anchored to
    // the right edge and sized to its contents, so the wider menu can never
    // push the button off-screen.
    wrap.dir = "ltr";
    wrap.style.cssText =
      "position:fixed;top:calc(env(safe-area-inset-top, 0px) + 8px);right:10px;left:auto;" +
      "width:max-content;display:flex;flex-direction:column;align-items:flex-end;" +
      "z-index:2147483000;font-family:'Assistant',sans-serif";

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "גיבוי ושחזור");
    button.textContent = "⋯";
    button.style.cssText =
      "width:30px;height:30px;border-radius:50%;border:1px solid rgba(110,190,232,.28);" +
      "background:rgba(255,255,255,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" +
      "color:#5B6B7F;font-size:15px;line-height:1;cursor:pointer;padding:0;" +
      "box-shadow:0 3px 10px rgba(32,49,70,.08)";

    var menu = document.createElement("div");
    menu.hidden = true;
    menu.dir = "rtl";
    menu.style.cssText =
      "margin-top:6px;min-width:150px;border-radius:14px;overflow:hidden;" +
      "background:rgba(255,255,255,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);" +
      "border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(35,52,74,.14)";

    var note = document.createElement("div");
    note.style.cssText =
      "padding:8px 12px;font-size:12px;color:#6B7280;text-align:right;display:none";

    function say(message) {
      note.textContent = message;
      note.style.display = "block";
      setTimeout(function () {
        note.style.display = "none";
      }, 3200);
    }

    function item(label, onClick) {
      var el = document.createElement("button");
      el.type = "button";
      el.textContent = label;
      el.style.cssText =
        "display:block;width:100%;padding:11px 14px;border:0;background:none;cursor:pointer;" +
        "font:inherit;font-size:14px;color:#111827;text-align:right";
      el.addEventListener("click", function () {
        menu.hidden = true;
        onClick(say);
      });
      return el;
    }

    menu.appendChild(item("גיבוי נתונים", runBackup));
    menu.appendChild(item("שחזור מגיבוי", runRestore));
    menu.appendChild(note);

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", function () {
      menu.hidden = true;
    });

    wrap.appendChild(button);
    wrap.appendChild(menu);
    return wrap;
  }

  function start() {
    installAppMetas();
    requestDurableStorage();
    document.body.appendChild(buildControl());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
