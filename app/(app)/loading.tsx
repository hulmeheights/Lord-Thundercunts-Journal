export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="skeleton h-10 w-64 rounded-2xl" />
      <div className="flex gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[86px] w-[86px] rounded-full" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="skeleton h-64 rounded-[28px] lg:col-span-7" />
        <div className="skeleton h-64 rounded-[28px] lg:col-span-5" />
      </div>
    </div>
  );
}
