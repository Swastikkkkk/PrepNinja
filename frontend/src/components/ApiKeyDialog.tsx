import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getKey, setKey, KEY_EVENT } from "@/lib/geminiKey";

export default function ApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(Boolean(getKey()));

  useEffect(() => {
    const onNeed = (e: Event) => {
      setReason((e as CustomEvent<string>).detail || "");
      setValue(getKey());
      setOpen(true);
    };
    window.addEventListener(KEY_EVENT, onNeed);
    return () => window.removeEventListener(KEY_EVENT, onNeed);
  }, []);

  return (
    <>
      <button
        onClick={() => { setReason(""); setValue(getKey()); setOpen(true); }}
        className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/90 dark:text-neutral-200"
      >
        <KeyRound className="h-3.5 w-3.5" />
        {saved ? "Gemini key saved" : "Add Gemini key"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Use your own Gemini key</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              PrepNinja's interviews, coding questions and resume checks run on Google Gemini. Keys are free: create one in{" "}
              <a className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>{" "}
              and paste it below. It stays in this browser and is only sent with your own requests.
            </p>
            {reason && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{reason}</p>}
            <input
              autoFocus
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="AIza..."
              className="mt-4 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:text-white dark:focus:border-neutral-300"
            />
            <div className="mt-4 flex justify-end gap-2">
              {saved && (
                <Button variant="ghost" onClick={() => { setKey(""); setValue(""); setSaved(false); }}>Remove</Button>
              )}
              <Button disabled={!value.trim()} onClick={() => { setKey(value.trim()); setSaved(true); setOpen(false); }}>Save key</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
