/**
 * First-run entry point: the choice between creating a new wallet (BUS-15) and
 * importing an existing one (BUS-16).
 */

interface WelcomeProps {
  readonly onCreate: () => void;
  readonly onImport: () => void;
}

export function Welcome({ onCreate, onImport }: WelcomeProps) {
  return (
    <section className="screen screen--centered">
      <img className="screen__logo" src="/icons/icon-48.png" alt="" width={48} height={48} />
      <h1 className="screen__title">CoinTrunk Wallet</h1>
      <p className="screen__body">Your BeeZee wallet. Keys stay on this device.</p>
      <button className="button" type="button" onClick={onCreate}>
        Create a new wallet
      </button>
      <button className="button button--secondary" type="button" onClick={onImport}>
        Import an existing wallet
      </button>
    </section>
  );
}
