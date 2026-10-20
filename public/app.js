const source = document.querySelector("[data-slug-source]");
const target = document.querySelector("[data-slug-target]");
if (source && target) {
  source.addEventListener("input", () => {
    if (target.dataset.touched === "1") return;
    target.value = source.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  });
  target.addEventListener("input", () => {
    target.dataset.touched = "1";
  });
}

document.querySelectorAll("canvas[data-sign-pad]").forEach((canvas) => {
  const context = canvas.getContext("2d");
  const hidden = canvas.parentElement.querySelector("[name=signatureData]");
  const scale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 480;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(140 * scale);
  context.scale(scale, scale);
  context.lineWidth = 2;
  context.lineCap = "round";
  context.strokeStyle = "#142033";
  let drawing = false;

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
  });
  canvas.addEventListener("pointerup", () => {
    drawing = false;
    if (hidden) hidden.value = canvas.toDataURL("image/png");
  });
});
