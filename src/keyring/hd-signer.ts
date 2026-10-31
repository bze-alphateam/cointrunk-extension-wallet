/**
 * The real signer behind an unlocked keyring (BUS-51): a CosmJS
 * `DirectSecp256k1HdWallet` for the BeeZee account (prefix `bze`, path
 * {@link BZE_HD_PATH}), signing in `SIGN_MODE_DIRECT`.
 *
 * The wallet object holds the seed, so it is captured in a closure and never
 * exposed: the returned {@link Signer} has only methods, so nothing that
 * serialises or logs it (or walks its properties) can reach key material. The
 * keyring drops the signer on lock, auto-lock and service-worker teardown,
 * and the wallet goes with it.
 */

import { stringToPath } from '@cosmjs/crypto';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { BZE_BECH32_PREFIX, BZE_HD_PATH } from '../chain/constants';
import type { Signer } from './crypto';

/** Build the in-memory signer for `mnemonic`. The caller must not keep the mnemonic. */
export async function createHdSigner(mnemonic: string): Promise<Signer> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: BZE_BECH32_PREFIX,
    hdPaths: [stringToPath(BZE_HD_PATH)],
  });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error('failed to derive a BeeZee account');
  }
  const { address, pubkey } = account;

  return {
    getPublicKey: async () => pubkey.slice(),
    sign: ({ signDoc }) => wallet.signDirect(address, signDoc),
  };
}
