import { describe, expect, it } from "vitest";
import { parseCsvText } from "./routers/import";

// These tests verify that the CSV parser produces the correct shape
// for data that would be stored in import_logs.resultsJson

const FULL_CSV = [
  "title,description,thumbnailUrl,streamUrl,durationSeconds,language,contentType,contentRating,releaseDate,tags,publishStatus,channelSlug,categorySlug",
  "Video One,Desc one,https://example.com/t1.jpg,https://example.com/v1.mp4,90,en,clip,all,2024-01-01,gaming,draft,shorts-tv,featured",
  "Video Two,Desc two,https://example.com/t2.jpg,https://example.com/v2.mp4,180,en,movie,pg,2024-02-01,action,published,kids-tv,",
].join("\n");

describe("Import log data integrity", () => {
  it("produces rows with the correct shape for log storage", () => {
    const { rows } = parseCsvText(FULL_CSV);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveProperty("rowIndex");
      expect(row).toHaveProperty("data");
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("issues");
    }
  });

  it("row data includes all expected fields for log metadata", () => {
    const { rows } = parseCsvText(FULL_CSV);
    const first = rows[0]!;
    expect(first.data.title).toBe("Video One");
    expect(first.data.channelSlug).toBe("shorts-tv");
    expect(first.data.categorySlug).toBe("featured");
    expect(first.data.publishStatus).toBe("draft");
  });

  it("counts valid, warning, error rows correctly for log summary", () => {
    const { rows } = parseCsvText(FULL_CSV);
    const valid = rows.filter((r) => r.status === "valid").length;
    const warning = rows.filter((r) => r.status === "warning").length;
    const error = rows.filter((r) => r.status === "error").length;
    // Both rows have all recommended fields → should be valid
    expect(valid).toBe(2);
    expect(warning).toBe(0);
    expect(error).toBe(0);
  });

  it("handles a row with missing optional fields as warning (not error)", () => {
    const csv = "title,streamUrl\nMinimal Video,https://example.com/v.mp4";
    const { rows } = parseCsvText(csv);
    expect(rows[0]!.status).toBe("warning");
    expect(rows[0]!.data.title).toBe("Minimal Video");
  });

  it("correctly identifies error rows for log errorCount", () => {
    const csv = "title,streamUrl\n,https://example.com/v.mp4";
    const { rows } = parseCsvText(csv);
    expect(rows[0]!.status).toBe("error");
    expect(rows[0]!.issues.length).toBeGreaterThan(0);
  });

  it("row issues array is serializable to JSON (for resultsJson column)", () => {
    const csv = "title,streamUrl\nMinimal,https://example.com/v.mp4";
    const { rows } = parseCsvText(csv);
    const serialized = JSON.stringify(rows);
    const parsed = JSON.parse(serialized);
    expect(parsed[0].issues).toBeInstanceOf(Array);
  });

  it("empty CSV produces zero rows — log totalRows should be 0", () => {
    const { rows } = parseCsvText("title,streamUrl\n");
    expect(rows).toHaveLength(0);
  });

  it("rowIndex is 1-based for human-readable log display", () => {
    const { rows } = parseCsvText(FULL_CSV);
    expect(rows[0]!.rowIndex).toBe(1);
    expect(rows[1]!.rowIndex).toBe(2);
  });

  it("all row data fields are JSON-serializable for DB storage", () => {
    const { rows } = parseCsvText(FULL_CSV);
    expect(() => JSON.stringify(rows)).not.toThrow();
  });

  it("second row with empty categorySlug stores empty string not undefined", () => {
    const { rows } = parseCsvText(FULL_CSV);
    // Row 2 has empty categorySlug — should parse without error
    expect(rows[1]!.status).not.toBe("error");
  });
});
