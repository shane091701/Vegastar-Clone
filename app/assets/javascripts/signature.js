// "My Signature" — lets a logged-in user upload the signature image that
// gets stamped onto dispatched Purchase Order PDFs. Kept out of portal.js
// because that file is regenerated from Source/ by tools/port_frontend.ps1.
(function () {
  function init() {
    var profileBox = document.querySelector(".user-profile");
    if (!profileBox || document.getElementById("signatureBtn")) return;

    var btn = document.createElement("button");
    btn.id = "signatureBtn";
    btn.className = "btn btn-sm btn-outline-secondary ms-2";
    btn.style.cssText = "font-size: 0.75rem; padding: 0.25rem 0.75rem;";
    btn.textContent = "My Signature";
    btn.onclick = openSignatureModal;
    profileBox.insertBefore(btn, profileBox.querySelector("button"));

    var modal = document.createElement("div");
    modal.innerHTML =
      '<div class="modal fade" id="signatureModal" tabindex="-1" aria-hidden="true">' +
      '  <div class="modal-dialog modal-dialog-centered">' +
      '    <div class="modal-content border-0 shadow">' +
      '      <div class="modal-header">' +
      '        <h5 class="modal-title fw-bold">My Signature</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
      '      </div>' +
      '      <div class="modal-body">' +
      '        <div id="signature-alert" class="alert py-2" style="display:none; font-size: 0.85rem;"></div>' +
      '        <p class="small text-muted mb-2">This image is stamped onto Purchase Order PDFs you dispatch. ' +
      "        Use a clear photo or scan of your signature on a white background (PNG or JPG).</p>" +
      '        <div id="signature-preview-wrap" class="text-center mb-3" style="display:none;">' +
      '          <div class="small fw-bold text-muted mb-1">Current signature:</div>' +
      '          <img id="signature-preview" src="" alt="Current signature" style="max-height:90px; max-width:100%; border:1px solid #dee2e6; border-radius:4px; padding:4px; background:#fff;">' +
      "        </div>" +
      '        <div class="mb-2">' +
      '          <label class="form-label fw-bold small text-muted">Upload new signature image</label>' +
      '          <input type="file" id="signatureFile" class="form-control" accept="image/*">' +
      "        </div>" +
      "      </div>" +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>' +
      '        <button type="button" class="btn btn-primary fw-bold" id="signatureSaveBtn" onclick="submitSignature()">Save Signature</button>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(modal.firstElementChild);
  }

  function showAlert(msg, kind) {
    var box = document.getElementById("signature-alert");
    box.textContent = msg;
    box.className = "alert py-2 alert-" + (kind || "danger");
    box.style.display = "block";
  }

  window.openSignatureModal = function () {
    var box = document.getElementById("signature-alert");
    if (box) box.style.display = "none";
    var fileInput = document.getElementById("signatureFile");
    if (fileInput) fileInput.value = "";

    google.script.run
      .withSuccessHandler(function (res) {
        var wrap = document.getElementById("signature-preview-wrap");
        if (res && res.url) {
          document.getElementById("signature-preview").src = res.url + "&cb=" + Date.now();
          wrap.style.display = "block";
        } else {
          wrap.style.display = "none";
        }
      })
      .withFailureHandler(function () {})
      .getMySignature();

    new bootstrap.Modal(document.getElementById("signatureModal")).show();
  };

  window.submitSignature = function () {
    var fileInput = document.getElementById("signatureFile");
    var btn = document.getElementById("signatureSaveBtn");
    if (!fileInput.files.length) {
      showAlert("Please choose an image file first.");
      return;
    }
    var file = fileInput.files[0];
    if (file.type.indexOf("image/") !== 0) {
      showAlert("Signature must be an image file (PNG or JPG).");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    var reader = new FileReader();
    reader.onload = function () {
      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          btn.textContent = "Save Signature";
          if (res && res.url) {
            document.getElementById("signature-preview").src = res.url + "&cb=" + Date.now();
            document.getElementById("signature-preview-wrap").style.display = "block";
          }
          fileInput.value = "";
          showAlert("Signature saved! It will appear on POs you dispatch from now on.", "success");
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.textContent = "Save Signature";
          showAlert("Error: " + (err && err.message ? err.message : "upload failed"));
        })
        .uploadSignature({
          name: file.name,
          mimeType: file.type,
          data: String(reader.result).split(",")[1]
        });
    };
    reader.onerror = function () {
      btn.disabled = false;
      btn.textContent = "Save Signature";
      showAlert("Could not read that file. Please try another image.");
    };
    reader.readAsDataURL(file);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
