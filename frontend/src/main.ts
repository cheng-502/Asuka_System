import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element was not found");
}

app.innerHTML = `
  <main class="shell" aria-labelledby="page-title">
    <section class="status-card">
      <p class="eyebrow">MVP-1 · GESTURE-CONTROLLED KNOWLEDGE SPACE</p>
      <h1 id="page-title">Auaka System</h1>
      <p class="status-copy">
        The Three.js knowledge-space renderer and local hand-tracking runtime
        will be initialized in the next implementation tasks.
      </p>
      <div class="status-pill" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        Runtime scaffold ready
      </div>
    </section>
  </main>
`;
