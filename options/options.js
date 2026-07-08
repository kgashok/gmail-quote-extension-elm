// ── Default values ──────────────────────────────────────────────────────────

const DEFAULTS = {
  borderColor:    '#007bff',
  borderWidth:    3,
  boxBorderColor: '#e0e0e0',
  bgColor:        '#f0f7ff',
  textStyle:      'italic',
  fontFamily:     'inherit',
};

// ── Element refs ────────────────────────────────────────────────────────────

const appIdInput    = document.getElementById('appId');
const saveAppIdBtn  = document.getElementById('saveAppId');
const appIdStatus   = document.getElementById('appIdStatus');

const borderColorEl    = document.getElementById('borderColor');
const borderHexEl      = document.getElementById('borderHex');
const borderSwatch     = document.getElementById('borderSwatch');
const borderWidthEl    = document.getElementById('borderWidth');
const borderWidthVal   = document.getElementById('borderWidthVal');
const boxBorderColorEl = document.getElementById('boxBorderColor');
const boxBorderHexEl   = document.getElementById('boxBorderHex');
const boxBorderSwatch  = document.getElementById('boxBorderSwatch');
const bgColorEl        = document.getElementById('bgColor');
const bgHexEl          = document.getElementById('bgHex');
const bgSwatch         = document.getElementById('bgSwatch');
const textStyleEl      = document.getElementById('textStyle');
const fontFamilyEl     = document.getElementById('fontFamily');
const preview          = document.getElementById('preview');
const saveStyleBtn     = document.getElementById('saveStyle');
const resetStyleBtn    = document.getElementById('resetStyle');
const styleStatus      = document.getElementById('styleStatus');

// ── Load saved values on open ───────────────────────────────────────────────

chrome.storage.sync.get(['inboxSdkAppId', 'blockquoteStyle'], ({ inboxSdkAppId, blockquoteStyle }) => {
  if (inboxSdkAppId) appIdInput.value = inboxSdkAppId;

  const s = Object.assign({}, DEFAULTS, blockquoteStyle || {});
  applyToForm(s);
  updatePreview(s);
});

// ── App ID section ──────────────────────────────────────────────────────────

saveAppIdBtn.addEventListener('click', () => {
  const appId = appIdInput.value.trim();

  if (!appId) {
    showStatus(appIdStatus, 'App ID cannot be empty.', 'err');
    return;
  }
  if (!/^sdk_/.test(appId)) {
    showStatus(appIdStatus, 'App ID should start with "sdk_". Double-check the value.', 'err');
    return;
  }

  chrome.storage.sync.set({ inboxSdkAppId: appId }, () => {
    showStatus(appIdStatus, 'Saved.', 'ok');
  });
});

// ── Style section ───────────────────────────────────────────────────────────

borderColorEl.addEventListener('input', () => {
  const hex = borderColorEl.value;
  borderSwatch.style.background = hex;
  borderHexEl.textContent = hex;
  updatePreview(currentStyle());
});

borderWidthEl.addEventListener('input', () => {
  borderWidthVal.textContent = borderWidthEl.value + ' px';
  updatePreview(currentStyle());
});

boxBorderColorEl.addEventListener('input', () => {
  const hex = boxBorderColorEl.value;
  boxBorderSwatch.style.background = hex;
  boxBorderHexEl.textContent = hex;
  updatePreview(currentStyle());
});

bgColorEl.addEventListener('input', () => {
  const hex = bgColorEl.value;
  bgSwatch.style.background = hex;
  bgHexEl.textContent = hex;
  updatePreview(currentStyle());
});

textStyleEl.addEventListener('change', () => updatePreview(currentStyle()));
fontFamilyEl.addEventListener('change', () => updatePreview(currentStyle()));

saveStyleBtn.addEventListener('click', () => {
  const s = currentStyle();
  chrome.storage.sync.set({ blockquoteStyle: s }, () => {
    showStatus(styleStatus, 'Saved.', 'ok');
  });
});

resetStyleBtn.addEventListener('click', () => {
  applyToForm(DEFAULTS);
  updatePreview(DEFAULTS);
  chrome.storage.sync.set({ blockquoteStyle: DEFAULTS }, () => {
    showStatus(styleStatus, 'Reset to defaults.', 'ok');
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentStyle() {
  return {
    borderColor:    borderColorEl.value,
    borderWidth:    Number(borderWidthEl.value),
    boxBorderColor: boxBorderColorEl.value,
    bgColor:        bgColorEl.value,
    textStyle:      textStyleEl.value,
    fontFamily:     fontFamilyEl.value,
  };
}

function applyToForm(s) {
  borderColorEl.value           = s.borderColor;
  borderSwatch.style.background = s.borderColor;
  borderHexEl.textContent       = s.borderColor;

  borderWidthEl.value           = s.borderWidth;
  borderWidthVal.textContent    = s.borderWidth + ' px';

  boxBorderColorEl.value           = s.boxBorderColor;
  boxBorderSwatch.style.background = s.boxBorderColor;
  boxBorderHexEl.textContent       = s.boxBorderColor;

  bgColorEl.value               = s.bgColor;
  bgSwatch.style.background     = s.bgColor;
  bgHexEl.textContent           = s.bgColor;

  textStyleEl.value             = s.textStyle;
  fontFamilyEl.value            = s.fontFamily;
}

function updatePreview(s) {
  preview.style.border       = `1px solid ${s.boxBorderColor}`;
  preview.style.borderLeft   = `${s.borderWidth}px solid ${s.borderColor}`;
  preview.style.background   = s.bgColor;
  preview.style.fontStyle    = s.textStyle.includes('italic') ? 'italic' : 'normal';
  preview.style.fontWeight   = s.textStyle.includes('bold')   ? 'bold'   : 'normal';
  preview.style.fontFamily   = s.fontFamily === 'inherit' ? '' : s.fontFamily;
}

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = 'status ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 3000);
}
