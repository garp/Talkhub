// tiny spinner util (no deps)
function createSpinner(text = '') {
  const frames = ['-', '\\', '|', '/'];
  let i = 0; let timer = null; let
    _text = text;

  const render = () => {
    const frame = frames[i = (i + 1) % frames.length];
    process.stdout.write(`\r${frame} ${_text}   `);
  };

  return {
    start(msg) {
      if (msg) _text = msg;
      if (!timer) timer = setInterval(render, 80);
    },
    set text(msg) { _text = msg; },
    succeed(msg) {
      this.stop();
      console.log(`\r✔ ${msg}`);
    },
    warn(msg) {
      this.stop();
      console.log(`\r⚠ ${msg}`);
    },
    fail(msg) {
      this.stop();
      console.log(`\r✖ ${msg}`);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write('\r'); // clear line
    },
  };
}

module.exports = createSpinner;
