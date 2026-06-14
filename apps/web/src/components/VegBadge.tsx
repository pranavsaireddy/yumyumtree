// Standard Indian veg/non-veg indicator: a bordered square with a centre dot —
// green for veg, red/brown for non-veg. Presentational; safe in a server
// component. Class names are written out in full so Tailwind's scanner sees them.

export default function VegBadge({ isVeg }: { isVeg: boolean }) {
  const label = isVeg ? "Vegetarian" : "Non-vegetarian";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 ${
        isVeg ? "border-veg" : "border-nonveg"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${isVeg ? "bg-veg" : "bg-nonveg"}`}
      />
    </span>
  );
}
