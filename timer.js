document.addEventListener("DOMContentLoaded", () => {
  const timerEl = document.querySelector(".div-timer");
  if (!timerEl) return;

  const display = timerEl.querySelector(".timer-display");
  const startBtn = timerEl.querySelector(".timer-start");
  const pauseBtn = timerEl.querySelector(".timer-pause");
  const resetBtn = timerEl.querySelector(".timer-reset");
  const minutesInput = timerEl.querySelector(".timer-minutes-input");

  let durationSeconds = parseInt(timerEl.dataset.duration, 10) || 600;
  let remaining = durationSeconds;
  let intervalId = null;

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function render() {
    display.textContent = formatTime(remaining);
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      render();
      clearInterval(intervalId);
      intervalId = null;
      display.textContent = "Time's Up!";
      return;
    }
    render();
  }

  function start() {
    if (intervalId || remaining <= 0) return;
    intervalId = setInterval(tick, 1000);
  }

  function pause() {
    clearInterval(intervalId);
    intervalId = null;
  }

  function reset() {
    pause();
    if (minutesInput) {
      const minutes = parseInt(minutesInput.value, 10) || 10;
      durationSeconds = minutes * 60;
    }
    remaining = durationSeconds;
    render();
  }

  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", pause);
  resetBtn.addEventListener("click", reset);
  if (minutesInput) {
    minutesInput.addEventListener("change", reset);
  }

  render();
});
