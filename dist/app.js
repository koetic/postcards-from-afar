const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sizes = [16, 12, 8, 6, 4, 2, 1];
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const state = { image: null, imageUrl: "", journey: null, result: null, sampleIndex: 0, activeDemo: "rainbow" };

const demos = {
  rainbow: {
    src: "assets/rainbow.webp",
    title: "好运在陌生人之间传递",
    size: 4,
    generation: 4,
    messages: [
      { text: "雨停的时候看见了彩虹，把今天遇见的好运，分你一半。", name: "阿远" },
      { text: "最近过得不太顺利，但看到这句话，决定再期待一下明天。", name: "小满" },
      { text: "把这份好运带去海边啦，也希望下一个看见它的人开心。", name: "橘子" },
      { text: "看见它的人，都会幸运一点。现在轮到你啦。", name: "路过的风" }
    ]
  },
  prayer: {
    src: "assets/prayer-flags.webp",
    title: "风把祝福带到下一站",
    size: 8,
    generation: 3,
    messages: [
      { text: "在草原站了很久。风吹过这里，也吹过想你的时候。", name: "阿远" },
      { text: "愿你永远有出发的勇气，也永远有可以回去的地方。", name: "山海" },
      { text: "今天把这句祝福寄往南方。陌生人，祝你一路有光。", name: "北纬二十七度" }
    ]
  },
  grass: {
    src: "assets/grass-doll.webp",
    title: "把平凡的一天寄给你",
    size: 12,
    generation: 2,
    messages: [
      { text: "今天什么也没做，但很开心。带着小朋友在草地晒了一下午太阳。", name: "阿远" },
      { text: "希望你也有晒晒太阳的心情，不用每时每刻都很有意义。", name: "慢慢来" }
    ]
  }
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = src;
  });
}

function drawCover(context, source, x, y, width, height) {
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;
  context.drawImage(source, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
}

function drawFittedPhoto(context, source, x, y, width, height, pixelated = false) {
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  const backdrop = document.createElement("canvas");
  backdrop.width = 80;
  backdrop.height = Math.max(1, Math.round(80 * height / width));
  const backdropContext = backdrop.getContext("2d");
  backdropContext.imageSmoothingEnabled = true;
  backdropContext.imageSmoothingQuality = "high";
  drawCover(backdropContext, source, 0, 0, backdrop.width, backdrop.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(backdrop, x - 16, y - 16, width + 32, height + 32);
  context.fillStyle = "rgba(20, 32, 27, .3)";
  context.fillRect(x, y, width, height);

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  context.imageSmoothingEnabled = !pixelated;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

function sourceToRgb(source, width, height, smooth = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = "high";
  drawCover(context, source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function distanceSquared(a, b) {
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return red * red + green * green + blue * blue;
}

function quantize(data, maxColors = 16) {
  const points = [];
  const unique = new Map();
  for (let index = 0; index < data.length; index += 4) {
    const point = [data[index], data[index + 1], data[index + 2]];
    points.push(point);
    unique.set(point.join(","), point);
  }
  if (unique.size <= maxColors) {
    const palette = [...unique.values()];
    const indices = points.map(point => palette.findIndex(color => color[0] === point[0] && color[1] === point[1] && color[2] === point[2]));
    return { palette: palette.flat(), indices: Uint8Array.from(indices) };
  }

  const average = [0, 1, 2].map(channel => Math.round(points.reduce((sum, point) => sum + point[channel], 0) / points.length));
  const palette = [average];
  while (palette.length < maxColors) {
    let farthest = points[0];
    let farthestDistance = -1;
    for (const point of points) {
      const nearest = Math.min(...palette.map(color => distanceSquared(point, color)));
      if (nearest > farthestDistance) {
        farthest = point;
        farthestDistance = nearest;
      }
    }
    if (farthestDistance === 0) break;
    palette.push(farthest);
  }

  let indices = new Uint8Array(points.length);
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    points.forEach((point, index) => {
      let nearest = 0;
      let nearestDistance = Infinity;
      palette.forEach((color, colorIndex) => {
        const distance = distanceSquared(point, color);
        if (distance < nearestDistance) {
          nearest = colorIndex;
          nearestDistance = distance;
        }
      });
      indices[index] = nearest;
      sums[nearest][0] += point[0];
      sums[nearest][1] += point[1];
      sums[nearest][2] += point[2];
      sums[nearest][3] += 1;
    });
    sums.forEach((sum, index) => {
      if (sum[3]) palette[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }
  return { palette: palette.flat().map(value => Math.round(value)), indices };
}

function pixelize(source, size, generation, messages) {
  const quantized = quantize(sourceToRgb(source, size, size));
  return { version: 1, generation, width: size, height: size, palette: quantized.palette, indices: quantized.indices, messages };
}

function journeyToCanvas(journey) {
  const canvas = document.createElement("canvas");
  canvas.width = journey.width;
  canvas.height = journey.height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(journey.width, journey.height);
  const paletteSize = journey.palette.length / 3;
  for (let index = 0; index < journey.indices.length; index += 1) {
    const color = Math.min(journey.indices[index], paletteSize - 1) * 3;
    image.data[index * 4] = journey.palette[color];
    image.data[index * 4 + 1] = journey.palette[color + 1];
    image.data[index * 4 + 2] = journey.palette[color + 2];
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function renderJourney(journey, canvas) {
  const source = journeyToCanvas(journey);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  drawCover(context, source, 0, 0, canvas.width, canvas.height);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("链接数据格式不正确");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function compress(bytes) {
  if (!("CompressionStream" in window)) return { prefix: "j", bytes };
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return { prefix: "g", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function decompress(prefix, bytes) {
  if (prefix === "j") return bytes;
  if (prefix !== "g" || !("DecompressionStream" in window)) throw new Error("当前浏览器无法读取这段旅程，请使用新版浏览器打开");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function serializeJourney(journey) {
  const packed = new Uint8Array(Math.ceil(journey.indices.length / 2));
  journey.indices.forEach((value, index) => {
    packed[Math.floor(index / 2)] |= value << (index % 2 === 0 ? 4 : 0);
  });
  const raw = {
    v: 1,
    g: journey.generation,
    w: journey.width,
    h: journey.height,
    p: bytesToBase64(Uint8Array.from(journey.palette)),
    d: bytesToBase64(packed),
    m: journey.messages.map(message => [message.text, message.name])
  };
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  const compressed = await compress(bytes);
  const link = `${location.origin}${location.pathname}#p=${compressed.prefix}${bytesToBase64(compressed.bytes)}`;
  if (link.length > 7000) throw new Error("这段旅程已经超过了链接能承载的长度，请缩短新留言后再试");
  return link;
}

async function deserializeJourney(payload) {
  if (!payload || payload.length > 7000) throw new Error("明信片链接不完整或过长");
  const bytes = await decompress(payload[0], base64ToBytes(payload.slice(1)));
  if (bytes.length > 20000) throw new Error("明信片数据异常");
  const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (raw.v !== 1 || !Number.isInteger(raw.g) || raw.g < 1 || raw.g > 50) throw new Error("明信片版本不受支持");
  if (raw.w !== raw.h || !sizes.includes(raw.w)) throw new Error("明信片像素尺寸不正确");
  if (!Array.isArray(raw.m) || raw.m.length !== raw.g || raw.m.length > 50) throw new Error("明信片留言数据不正确");
  const messages = raw.m.map(item => {
    if (!Array.isArray(item) || typeof item[0] !== "string" || !item[0].trim() || item[0].length > 120 || typeof item[1] !== "string" || item[1].length > 16) throw new Error("明信片留言格式不正确");
    return { text: item[0], name: item[1] };
  });
  const palette = [...base64ToBytes(raw.p)];
  if (!palette.length || palette.length % 3 !== 0 || palette.length / 3 > 16) throw new Error("明信片色彩数据不正确");
  const packed = base64ToBytes(raw.d);
  if (packed.length !== Math.ceil(raw.w * raw.h / 2)) throw new Error("明信片像素数据不完整");
  const indices = new Uint8Array(raw.w * raw.h);
  indices.forEach((_, index) => {
    const value = index % 2 === 0 ? packed[Math.floor(index / 2)] >> 4 : packed[Math.floor(index / 2)] & 15;
    if (value >= palette.length / 3) throw new Error("明信片像素索引不正确");
    indices[index] = value;
  });
  return { version: 1, generation: raw.g, width: raw.w, height: raw.h, palette, indices, messages };
}

function createQr(link) {
  if (typeof qrcode !== "function") throw new Error("二维码组件未能加载，请刷新后重试");
  const qr = qrcode(0, "L");
  qr.addData(link);
  qr.make();
  return qr;
}

function drawQr(context, qr, x, y, size) {
  const count = qr.getModuleCount();
  const margin = 4;
  const scale = Math.max(2, Math.floor(size / (count + margin * 2)));
  const actualSize = (count + margin * 2) * scale;
  const offsetX = x + Math.floor((size - actualSize) / 2);
  const offsetY = y + Math.floor((size - actualSize) / 2);
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, size, size);
  context.fillStyle = "#1e3028";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) context.fillRect(offsetX + (column + margin) * scale, offsetY + (row + margin) * scale, scale, scale);
    }
  }
}

function wrapCanvasText(context, text, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const character of text.replaceAll("\r", "")) {
    if (character === "\n") {
      lines.push(line);
      line = "";
    } else if (context.measureText(line + character).width > maxWidth && line) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.join("").length < text.replaceAll("\n", "").length && lines.length) {
    let last = lines[lines.length - 1];
    while (context.measureText(`${last}…`).width > maxWidth && last) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function createExportCanvas(journey, originalImage, qr) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#e4ded1";
  context.lineWidth = 2;
  context.strokeRect(26, 26, 1548, 1148);
  const source = originalImage || journeyToCanvas(journey);
  drawFittedPhoto(context, source, 70, 70, 1460, 740, !originalImage);

  context.save();
  context.strokeStyle = "rgba(255,255,255,.82)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(1410, 165, 67, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(1410, 165, 57, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.9)";
  context.textAlign = "center";
  context.font = "30px SimSun, serif";
  context.fillText("远方", 1410, 160);
  context.font = "11px system-ui";
  context.fillText("POST FROM AFAR", 1410, 185);
  context.restore();

  const latest = journey.messages[journey.messages.length - 1];
  context.textAlign = "left";
  context.fillStyle = "#21352e";
  context.font = "34px KaiTi, STKaiti, serif";
  const lines = wrapCanvasText(context, latest.text, 1070, 4);
  lines.forEach((line, index) => context.fillText(line, 88, 925 + index * 48));
  context.fillStyle = "#77786d";
  context.font = "20px KaiTi, STKaiti, serif";
  context.fillText(`— ${latest.name || "未署名"}`, 88, 1130);
  context.font = "14px system-ui";
  context.fillText(`第 ${journey.generation} 站 · 来自远方的明信片`, 88, 1164);
  drawQr(context, qr, 1210, 830, 280);
  context.fillStyle = "#59645c";
  context.textAlign = "center";
  context.font = "16px system-ui";
  context.fillText("扫码，留下下一句话", 1350, 1145);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片生成失败")), "image/png"));
}

async function buildResult(journey, originalImage = null) {
  await document.fonts.ready;
  const link = await serializeJourney(journey);
  const qr = createQr(link);
  const canvas = createExportCanvas(journey, originalImage, qr);
  const blob = await canvasToBlob(canvas);
  state.result = { journey, link, qr, blob, dataUrl: canvas.toDataURL("image/png") };
  return state.result;
}

function showResult(result, isForward = false) {
  $("#resultImage").src = result.dataUrl;
  $("#qrCode").innerHTML = result.qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  $("#resultTitle").textContent = isForward ? "下一站，就交给远方。" : "远方，从这里开始。";
  $("#resultDescription").textContent = result.journey.generation === 1
    ? "对方扫码后会看到 16×16 像素版，这张保存的图片仍保持清晰。"
    : `这一站是 ${result.journey.width}×${result.journey.height} 像素，沿途 ${result.journey.messages.length} 段留言都已装进去。`;
  $("#makeAnother").hidden = isForward;
  if (!$("#resultDialog").open) $("#resultDialog").showModal();
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("is-visible"), 3200);
}

function setBusy(button, busy, label = "正在生成…") {
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.original || button.innerHTML;
    button.disabled = false;
  }
}

function friendlyError(error) {
  if (/code length overflow|超过了链接|超过了二维码/i.test(error.message)) return "这段旅程已接近二维码容量上限，请缩短新留言后再试。";
  return error.message || "生成时遇到问题，请换一张照片或稍后再试。";
}

function updatePreview() {
  const message = $("#messageInput").value.trim();
  const signature = $("#signatureInput").value.trim();
  $("#messageCount").textContent = $("#messageInput").value.length;
  $("#previewMessage").textContent = message || "写下一段话，让这张照片有目的地。";
  $("#previewSignature").textContent = `— ${signature || "未署名"}`;
  $("#createButton").disabled = !state.image || !message;
}

function setSelectedImage(image, url, title) {
  state.image = image;
  state.imageUrl = url;
  $("#previewBackdrop").src = url;
  $("#previewBackdrop").hidden = false;
  $("#previewPhoto").src = url;
  $("#previewPhoto").hidden = false;
  $("#previewPlaceholder").hidden = true;
  $("#uploadTitle").textContent = title;
  $("#uploadHint").textContent = "点击可重新选择照片";
  updatePreview();
}

async function selectFile(file) {
  if (!file) return;
  if (!imageTypes.includes(file.type)) return toast("请选择 JPG、PNG 或 WebP 照片。DNG 原片请先导出为 JPG。");
  if (file.size > 25 * 1024 * 1024) return toast("照片超过 25MB，请先压缩后再试。");
  try {
    const url = URL.createObjectURL(file);
    const image = await loadImage(url);
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = url;
    setSelectedImage(image, url, `已选择：${file.name}`);
  } catch {
    toast("这张照片暂时无法读取，请换一张试试。");
  }
}

function createTimeline(messages) {
  const fragment = document.createDocumentFragment();
  messages.forEach((message, index) => {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "timeline-meta";
    const station = document.createElement("span");
    station.textContent = `第 ${String(index + 1).padStart(2, "0")} 站`;
    const name = document.createElement("span");
    name.textContent = message.name || "未署名";
    const text = document.createElement("p");
    text.textContent = message.text;
    meta.append(station, name);
    item.append(meta, text);
    fragment.append(item);
  });
  return fragment;
}

function renderReceiver(journey) {
  $("#receiverCount").textContent = journey.generation;
  $("#receivedStation").textContent = `第 ${journey.generation} 站`;
  $("#receivedSize").textContent = `${journey.width} × ${journey.height} · 色彩还在，细节已成回忆`;
  $("#messageTotal").textContent = `${String(journey.messages.length).padStart(2, "0")} 段留言`;
  $("#messageTimeline").replaceChildren(createTimeline(journey.messages));
  renderJourney(journey, $("#receivedCanvas"));
  $("#continueComposer").hidden = true;
  $("#continueMessage").value = "";
  $("#continueSignature").value = "";
  $("#continueCount").textContent = "0";
  document.title = `第 ${journey.generation} 站｜来自远方的明信片`;
}

async function openFromHash() {
  const payload = new URLSearchParams(location.hash.slice(1)).get("p");
  if (!payload) return;
  try {
    const journey = await deserializeJourney(payload);
    $$("dialog[open]").forEach(dialog => dialog.close());
    state.journey = journey;
    $("#homeView").hidden = true;
    $("#receiverView").hidden = false;
    $(".skip-link").href = "#receiverMain";
    renderReceiver(journey);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  } catch (error) {
    goHome();
    toast(error.message || "这段旅程无法读取，请向寄件人重新获取完整链接。");
  }
}

function goHome() {
  history.replaceState(null, "", location.pathname);
  state.journey = null;
  $("#receiverView").hidden = true;
  $("#homeView").hidden = false;
  $(".skip-link").href = "#main";
  document.title = "来自远方的明信片｜让照片带着故事漂流";
}

function startCreating() {
  $$("dialog[open]").forEach(dialog => dialog.close());
  if (!$("#receiverView").hidden) goHome();
  requestAnimationFrame(() => $("#create").scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function openDemo(key) {
  const demo = demos[key];
  if (!demo) return;
  state.activeDemo = key;
  try {
    const image = await loadImage(demo.src);
    const journey = pixelize(image, demo.size, demo.generation, demo.messages);
    renderJourney(journey, $("#demoCanvas"));
    $("#demoTitle").textContent = demo.title;
    $("#demoStation").textContent = `示例旅程 · 第 ${demo.generation} 站 · ${demo.size}×${demo.size}`;
    $("#demoMessages").replaceChildren(createTimeline(demo.messages));
    $("#demoDialog").showModal();
  } catch {
    toast("示例照片暂时无法读取，请刷新后再试。");
  }
}

function resetCreator() {
  state.image = null;
  state.imageUrl = "";
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = "";
  $("#photoInput").value = "";
  $("#previewBackdrop").hidden = true;
  $("#previewBackdrop").removeAttribute("src");
  $("#previewPhoto").hidden = true;
  $("#previewPhoto").removeAttribute("src");
  $("#previewPlaceholder").hidden = false;
  $("#uploadTitle").textContent = "把此刻放在这里";
  $("#uploadHint").textContent = "点击选择或拖入照片 · JPG / PNG / WebP";
  $("#messageInput").value = "";
  $("#signatureInput").value = "";
  updatePreview();
}

function downloadResult() {
  if (!state.result) return;
  const url = URL.createObjectURL(state.result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `远方明信片-第${state.result.journey.generation}站.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("明信片已保存，把它寄给下一个人吧。");
}

async function shareResult() {
  if (!state.result) return;
  const file = new File([state.result.blob], `远方明信片-第${state.result.journey.generation}站.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "来自远方的明信片", text: "这张照片想继续漂流，留一句话再寄出去吧。" });
    } catch (error) {
      if (error.name !== "AbortError") toast("暂时无法调用系统分享，可以先保存图片。");
    }
  } else {
    downloadResult();
  }
}

async function copyResultLink() {
  if (!state.result) return;
  try {
    await navigator.clipboard.writeText(state.result.link);
    toast("传递链接已复制。对方打开后也能续写。 ");
  } catch {
    const input = document.createElement("textarea");
    input.value = state.result.link;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    toast(copied ? "传递链接已复制。" : "复制失败，请长按二维码识别或保存图片分享。");
  }
}

$("#photoInput").addEventListener("change", event => selectFile(event.target.files[0]));
$("#messageInput").addEventListener("input", updatePreview);
$("#signatureInput").addEventListener("input", updatePreview);

const uploadZone = $("#uploadZone");
["dragenter", "dragover"].forEach(type => uploadZone.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach(type => uploadZone.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.remove("is-dragging");
}));
uploadZone.addEventListener("drop", event => selectFile(event.dataTransfer.files[0]));

$("#useDemoPhoto").addEventListener("click", async () => {
  const demo = demos[state.activeDemo];
  try {
    const image = await loadImage(demo.src);
    resetCreator();
    setSelectedImage(image, demo.src, `已选择：${demo.title}`);
    startCreating();
  } catch {
    toast("这张原图暂时无法读取，请换一张照片试试。");
  }
});

$("#uploadOwnPhoto").addEventListener("click", () => {
  resetCreator();
  startCreating();
});

$("#sampleButton").addEventListener("click", async () => {
  const keys = Object.keys(demos);
  const key = keys[state.sampleIndex % keys.length];
  state.sampleIndex += 1;
  const demo = demos[key];
  try {
    const image = await loadImage(demo.src);
    setSelectedImage(image, demo.src, `已选择：${demo.title}`);
  } catch {
    toast("示例照片暂时无法读取。");
  }
});

$("#createButton").addEventListener("click", async () => {
  const button = $("#createButton");
  const message = $("#messageInput").value.trim();
  if (!state.image || !message) return;
  setBusy(button);
  try {
    const journey = pixelize(state.image, 16, 1, [{ text: message, name: $("#signatureInput").value.trim() }]);
    const result = await buildResult(journey, state.image);
    showResult(result);
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    setBusy(button, false);
    updatePreview();
  }
});

$("#continueButton").addEventListener("click", () => {
  $("#continueComposer").hidden = false;
  $("#continueComposer").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("#continueMessage").focus(), 400);
});
$("#continueMessage").addEventListener("input", () => $("#continueCount").textContent = $("#continueMessage").value.length);

$("#forwardButton").addEventListener("click", async () => {
  const button = $("#forwardButton");
  const message = $("#continueMessage").value.trim();
  if (!message) return toast("先写下一句话，再把明信片寄出去。");
  if (!state.journey) return;
  setBusy(button);
  try {
    const messages = [...state.journey.messages, { text: message, name: $("#continueSignature").value.trim() }];
    const nextSize = sizes[Math.min(state.journey.generation, sizes.length - 1)];
    const next = pixelize(journeyToCanvas(state.journey), nextSize, state.journey.generation + 1, messages);
    const result = await buildResult(next);
    state.journey = next;
    history.replaceState(null, "", result.link);
    renderReceiver(next);
    showResult(result, true);
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    setBusy(button, false);
  }
});

$("#saveCurrent").addEventListener("click", async () => {
  if (!state.journey) return;
  const button = $("#saveCurrent");
  setBusy(button, true, "正在保存…");
  try {
    const result = await buildResult(state.journey);
    showResult(result, state.journey.generation > 1);
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    setBusy(button, false);
  }
});

$("#downloadButton").addEventListener("click", downloadResult);
$("#shareButton").addEventListener("click", shareResult);
$("#copyLink").addEventListener("click", copyResultLink);
$("#makeAnother").addEventListener("click", () => {
  $("#resultDialog").close();
  resetCreator();
  startCreating();
});
$("#homeButton").addEventListener("click", () => {
  goHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#newFromReceiver").addEventListener("click", startCreating);
$$('[data-start]').forEach(button => button.addEventListener("click", startCreating));
$$('[data-close]').forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
$$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
}));

$$('[data-demo]').forEach(element => {
  element.addEventListener("click", () => openDemo(element.dataset.demo));
  if (element.getAttribute("role") === "button") element.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDemo(element.dataset.demo);
    }
  });
});

$$('canvas[data-pixel-src]').forEach(async canvas => {
  try {
    const size = Number(canvas.dataset.pixelSize);
    const image = await loadImage(canvas.dataset.pixelSrc);
    renderJourney(pixelize(image, size, sizes.indexOf(size) + 1, []), canvas);
  } catch {
    canvas.style.background = "#d8d8ca";
  }
});

window.addEventListener("hashchange", () => {
  const payload = new URLSearchParams(location.hash.slice(1)).get("p");
  if (payload) openFromHash();
  else if (!$("#receiverView").hidden) goHome();
});

updatePreview();
openFromHash();
