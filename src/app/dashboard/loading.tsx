/** Shimmering skeleton shown while the dashboard data loads. */
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6">
      {/* Navbar */}
      <div className="skeleton h-14 w-full rounded-2xl" />

      {/* Hero */}
      <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1 space-y-4">
          <div className="skeleton h-11 w-3/4 max-w-md rounded-xl" />
          <div className="skeleton h-5 w-56 rounded-lg" />
          <div className="skeleton h-4 w-full max-w-lg rounded-lg" />
          <div className="flex flex-wrap gap-3 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 w-32 rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="skeleton h-40 w-40 shrink-0 rounded-full" />
      </div>

      {/* Bento grid */}
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="skeleton h-80 sm:col-span-2" />
        <div className="skeleton h-80 sm:col-span-2" />
        <div className="skeleton h-52 sm:col-span-2" />
        <div className="skeleton h-52" />
        <div className="skeleton h-52" />
        <div className="skeleton h-52" />
        <div className="skeleton h-52" />
        <div className="skeleton h-52 sm:col-span-2" />
      </div>
    </main>
  );
}
