type Props = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = params.error === "1";
  const next = params.next ?? "/";

  return (
    <div className="min-h-full flex items-center justify-center bg-sky-50 p-6 font-sans">
      <form
        method="POST"
        action="/login/submit"
        className="w-full max-w-sm rounded-xl bg-white shadow-sm p-6 space-y-4"
      >
        <h1 className="text-xl font-bold">String Steps</h1>
        <p className="text-sm text-zinc-500">Enter the passcode to continue.</p>

        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="block text-sm font-medium mb-1">Passcode</span>
          <input
            type="password"
            name="password"
            autoFocus
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600">Incorrect passcode</p>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white"
        >
          Submit
        </button>
      </form>
    </div>
  );
}
