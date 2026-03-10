import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../tmp");
const outFile = path.join(outDir, "pptxgenjs-spike.pptx");

const fs = await import("node:fs/promises");
await fs.mkdir(outDir, { recursive: true });

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Doc Forge";
pptx.subject = "PptxGenJS Spike";
pptx.title = "PptxGenJS Spike";

pptx.defineSlideMaster({
  title: "SPIKE_MASTER",
  background: { color: "F7F4EE" },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.28,
        fill: { color: "C2410C" },
        line: { color: "C2410C" },
      },
    },
    {
      text: {
        text: "Doc Forge Spike",
        options: {
          x: 0.6,
          y: 7.05,
          w: 8,
          h: 0.2,
          fontFace: "Aptos",
          fontSize: 9,
          color: "1F2937",
          margin: 0,
        },
      },
    },
  ],
});

const slide1 = pptx.addSlide({ masterName: "SPIKE_MASTER" });
slide1.addText("PptxGenJS Spike", {
  x: 0.8,
  y: 1.3,
  w: 10.5,
  h: 0.8,
  fontFace: "Aptos Display",
  fontSize: 28,
  bold: true,
  color: "1F2937",
});
slide1.addText("Node / Next.js 経由で .pptx を生成できることを確認", {
  x: 0.9,
  y: 2.4,
  w: 11.2,
  h: 0.6,
  fontFace: "Aptos",
  fontSize: 16,
  color: "1F2937",
});
slide1.addNotes("PptxGenJS の最小スパイク。");

const slide2 = pptx.addSlide({ masterName: "SPIKE_MASTER" });
slide2.addText("確認項目", {
  x: 0.8,
  y: 1.0,
  w: 10.5,
  h: 0.6,
  fontFace: "Aptos Display",
  fontSize: 22,
  bold: true,
  color: "1F2937",
});
slide2.addText(
  ["• タイトルと本文", "• マスター定義", "• speaker notes", "• .pptx 書き出し"].join(
    "\n"
  ),
  {
    x: 1.1,
    y: 2.0,
    w: 10.8,
    h: 3.5,
    fontFace: "Aptos",
    fontSize: 16,
    color: "1F2937",
  }
);
slide2.addNotes("notes 付きの content slide を出力。");

await pptx.writeFile({ fileName: outFile });
console.log(outFile);
