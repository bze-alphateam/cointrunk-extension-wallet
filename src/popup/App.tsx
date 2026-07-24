/**
 * Placeholder popup view. Proves the UI layer renders end to end from the
 * toolbar; real wallet screens replace this in later epics.
 */
export function App() {
  return (
    <main className="app">
      <img className="app__logo" src="/icons/icon-48.png" alt="" width={48} height={48} />
      <h1 className="app__title">CoinTrunk Wallet</h1>
      <p className="app__subtitle">Your BeeZee wallet — coming soon.</p>
    </main>
  );
}
