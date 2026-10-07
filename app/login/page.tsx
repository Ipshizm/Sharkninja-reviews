export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-bold tracking-tight">SharkNinja India</h1>
      <p className="mt-1 text-[13px] text-ink-60">
        Amazon.in review sentiment. Enter the team password.
      </p>

      <form
        action="/api/login"
        method="post"
        className="mt-6 rounded-lg border border-line bg-white p-5"
      >
        <input type="hidden" name="next" value={next ?? "/"} />
        <label
          htmlFor="password"
          className="block text-[12px] font-semibold uppercase tracking-wide text-ink-60"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="mt-2 w-full rounded-md border border-line px-3 py-2 text-[14px] outline-none focus:border-teal"
        />
        {error === "unconfigured" ? (
          <p className="mt-3 text-[13px] text-red-700">
            APP_PASSWORD and AUTH_SECRET are not set on the server.
          </p>
        ) : error ? (
          <p className="mt-3 text-[13px] text-red-700">
            That password didn&apos;t match.
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-teal px-4 py-2 text-[14px] font-semibold text-ink hover:bg-teal-dark hover:text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
