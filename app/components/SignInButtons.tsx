/** The landing's provider buttons and consent line. With returnTo, sign-in comes back to that path. */
export function SignInButtons({ providers, appUrl, returnTo }: { providers: { google: boolean; github: boolean }; appUrl: string; returnTo?: string }) {
  const none = !providers.google && !providers.github;
  const href = (provider: string) => (returnTo ? `/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}` : `/auth/${provider}`);
  return (
    <>
      {providers.google && <a href={href("google")} className="btn btn-ink raised">Continue with Google</a>}
      {providers.github && <a href={href("github")} className="btn btn-ghost raised">Continue with GitHub</a>}
      {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
      {!none && (
        <p className="max-w-[46ch] text-sm leading-snug">
          Signing in only tells Pay Up who you are: your name, email and picture, nothing else. By continuing you agree to the{" "}
          <a href={`${appUrl}/terms`} className="link">Terms of Service</a> and <a href={`${appUrl}/privacy`} className="link">Privacy Policy</a>.
        </p>
      )}
    </>
  );
}
