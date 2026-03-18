import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Papa from "papaparse";

interface CSVExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

export function CSVExportButton({ data, filename, label = "Export CSV" }: CSVExportButtonProps) {
  const handleExport = () => {
    if (!data.length) return;
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={!data.length}>
      <Download className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}
