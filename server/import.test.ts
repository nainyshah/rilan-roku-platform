import { describe, expect, it } from "vitest";
import { parseCsvText } from "./routers/import";

const VALID_CSV = `title,description,thumbnailUrl,streamUrl,durationSeconds,language,contentType,contentRating,releaseDate,tags,publishStatus,channelSlug,categorySlug
My Video,A great video,https://example.com/thumb.jpg,https://example.com/video.mp4,120,en,clip,all,2024-01-15,gaming,draft,shorts-tv,featured
Another Video,Another desc,https://example.com/thumb2.jpg,https://example.com/video2.mp4,300,en,movie,pg,2024-02-01,action,published,kids-tv,`;

const MINIMAL_CSV = `title,streamUrl
Simple Video,https://example.com/video.mp4`;

const MISSING_REQUIRED_CSV = `title,streamUrl
,https://example.com/video.mp4`;

const BAD_URL_CSV = `title,streamUrl,thumbnailUrl
My Video,not-a-url,also-not-a-url`;

describe("parseCsvText", () => {
  it("parses a valid full CSV correctly", () => {
    const { rows, headers } = parseCsvText(VALID_CSV);
    expect(rows).toHaveLength(2);
    expect(headers).toContain("title");
    expect(headers).toContain("streamUrl");
  });

  it("marks rows with all recommended fields as valid", () => {
    const { rows } = parseCsvText(VALID_CSV);
    expect(rows[0]!.status).toBe("valid");
  });

  it("marks rows missing recommended fields as warning", () => {
    const { rows } = parseCsvText(MINIMAL_CSV);
    expect(rows[0]!.status).toBe("warning");
    expect(rows[0]!.issues.length).toBeGreaterThan(0);
  });

  it("marks rows missing required title as error", () => {
    const { rows } = parseCsvText(MISSING_REQUIRED_CSV);
    expect(rows[0]!.status).toBe("error");
    expect(rows[0]!.issues.some((i) => i.includes("title"))).toBe(true);
  });

  it("marks rows with invalid URLs as error", () => {
    const { rows } = parseCsvText(BAD_URL_CSV);
    expect(rows[0]!.status).toBe("error");
  });

  it("returns correct row counts", () => {
    const { rows } = parseCsvText(VALID_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.rowIndex).toBe(1);
    expect(rows[1]!.rowIndex).toBe(2);
  });

  it("parses durationSeconds as a number", () => {
    const { rows } = parseCsvText(VALID_CSV);
    expect(typeof rows[0]!.data.durationSeconds).toBe("number");
    expect(rows[0]!.data.durationSeconds).toBe(120);
  });

  it("handles empty CSV gracefully", () => {
    const { rows } = parseCsvText("title,streamUrl\n");
    expect(rows).toHaveLength(0);
  });

  it("trims whitespace from headers and values", () => {
    const csv = " title , streamUrl \n My Video , https://example.com/video.mp4 ";
    const { rows } = parseCsvText(csv);
    expect(rows[0]!.data.title).toBe("My Video");
  });

  it("warns about missing thumbnailUrl", () => {
    const { rows } = parseCsvText(MINIMAL_CSV);
    expect(rows[0]!.issues.some((i) => i.includes("thumbnailUrl"))).toBe(true);
  });

  it("warns about missing description", () => {
    const { rows } = parseCsvText(MINIMAL_CSV);
    expect(rows[0]!.issues.some((i) => i.includes("description"))).toBe(true);
  });
});
