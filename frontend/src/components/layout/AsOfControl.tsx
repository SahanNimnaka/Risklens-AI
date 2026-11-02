import { useAsOf } from "../../hooks/useAsOf";
import { Button } from "../ui/Button";
import { CalendarIcon } from "../ui/icons";

export function AsOfControl() {
  const { asOf, isDefault, resetAsOf, setAsOf } = useAsOf();

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="as-of-date"
        className="hidden text-xs font-medium uppercase tracking-wide text-slate-500 sm:block"
      >
        As of
      </label>
      <div className="relative">
        <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="as-of-date"
          type="date"
          value={asOf}
          onChange={(event) => {
            if (event.target.value) {
              setAsOf(event.target.value);
            }
          }}
          className="h-9 w-[9.75rem] rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm text-slate-800 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
      </div>
      {!isDefault && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetAsOf}
          className="hidden sm:inline-flex"
        >
          Reset
        </Button>
      )}
    </div>
  );
}
