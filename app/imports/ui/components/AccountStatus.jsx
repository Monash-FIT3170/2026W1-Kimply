import { Link } from 'react-router-dom';
import { signOut, useSessionResuming, useSignedInAccount } from '../accountSession';

// The line under a username field: who is signed in, or a way to sign up.
// `returnTo` is where /account sends the player afterwards, so signing up from an
// invite link lands back on that room rather than on /play.
export function AccountStatus({ returnTo }) {
  const signedInAccount = useSignedInAccount();
  const sessionResuming = useSessionResuming();

  if (sessionResuming) {
    return (
      <p className="mt-3 text-center font-manrope text-[13px] text-fg3" aria-hidden="true">
        &nbsp;
      </p>
    );
  }

  if (signedInAccount) {
    return (
      <p className="mt-3 text-center font-manrope text-[13px] text-fg3">
        Signed in as {signedInAccount.email} ·{' '}
        <button
          onClick={signOut}
          className="cursor-pointer border-none bg-transparent p-0 font-outfit font-bold text-fg"
        >
          Sign out
        </button>
      </p>
    );
  }

  return (
    <p className="mt-3 text-center font-manrope text-[13px] text-fg3">
      Want to save your stats?{' '}
      <Link to="/account" state={{ returnTo }} className="font-outfit font-bold text-fg">
        Sign up
      </Link>
    </p>
  );
}
