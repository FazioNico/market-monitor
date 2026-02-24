import { describe, expect, it } from "vitest";

import { parseFarsideEtfDatasetHtml } from "../../../src/market/farside-etf-client";

describe("farside ETF client parsing", () => {
  it("parses BTC all-data style tables and skips summary rows", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>Ignore me</td></tr>
          </table>
          <table>
            <tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>GBTC</th><th>Total</th></tr>
            <tr><td>Fee</td><td>0.25%</td><td>0.25%</td><td>1.50%</td><td></td></tr>
            <tr><td>Seed</td><td>10.0</td><td>10.0</td><td>0.0</td><td></td></tr>
            <tr><td>11 Jan 2024</td><td>111.1</td><td>222.2</td><td>(95.1)</td><td>238.2</td></tr>
            <tr><td>12 Jan 2024</td><td>-</td><td>50.0</td><td>(10.0)</td><td>40.0</td></tr>
            <tr><td>Total</td><td>111.1</td><td>272.2</td><td>(105.1)</td><td>278.2</td></tr>
          </table>
        </body>
      </html>
    `;

    const dataset = parseFarsideEtfDatasetHtml(html, {
      asset: "btc",
      capturedAt: "2026-02-24T09:00:00.000Z",
    });

    expect(dataset.asset).toBe("btc");
    expect(dataset.source).toBe("farside");
    expect(dataset.etfTickers).toEqual(["IBIT", "FBTC", "GBTC"]);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]).toEqual({
      date: "2024-01-11",
      byEtfNetFlowUsdM: {
        IBIT: 111.1,
        FBTC: 222.2,
        GBTC: -95.1,
      },
      totalNetFlowUsdM: 238.2,
    });
    expect(dataset.rows[1]?.byEtfNetFlowUsdM.IBIT).toBeNull();
    expect(dataset.rows[1]?.totalNetFlowUsdM).toBe(40);
  });

  it("drops placeholder rows with blank ETF cells and zero total", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>Total</th></tr>
            <tr><td>21 Feb 2026</td><td>12.0</td><td>(5.0)</td><td>7.0</td></tr>
            <tr><td>24 Feb 2026</td><td></td><td></td><td>0.0</td></tr>
          </table>
        </body>
      </html>
    `;

    const dataset = parseFarsideEtfDatasetHtml(html, { asset: "btc" });

    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0]?.date).toBe("2026-02-21");
    expect(dataset.rows[0]?.totalNetFlowUsdM).toBe(7);
  });

  it("parses ETH all-data style tables with two header rows", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><th></th><th>Blackrock</th><th>Fidelity</th><th>Grayscale</th><th>Total</th></tr>
            <tr><th></th><th>ETHA</th><th>FETH</th><th>ETHE</th><th></th></tr>
            <tr><td>Fee</td><td>0.25%</td><td>0.25%</td><td>2.50%</td><td></td></tr>
            <tr><td>Seed</td><td>10.0</td><td>5.0</td><td>0.0</td><td></td></tr>
            <tr><td>23 Jul 2024</td><td>266.5</td><td>71.3</td><td>(484.1)</td><td>(146.3)</td></tr>
            <tr><td>24 Jul 2024</td><td>74.4</td><td>0.0</td><td>(326.9)</td><td>(152.5)</td></tr>
            <tr><td>Average</td><td>170.4</td><td>35.7</td><td>(405.5)</td><td>(149.4)</td></tr>
          </table>
        </body>
      </html>
    `;

    const dataset = parseFarsideEtfDatasetHtml(html, {
      asset: "eth",
      capturedAt: "2026-02-24T09:00:00.000Z",
    });

    expect(dataset.asset).toBe("eth");
    expect(dataset.etfTickers).toEqual(["ETHA", "FETH", "ETHE"]);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]).toMatchObject({
      date: "2024-07-23",
      totalNetFlowUsdM: -146.3,
    });
    expect(dataset.rows[0]?.byEtfNetFlowUsdM.ETHE).toBe(-484.1);
    expect(dataset.rows[1]?.date).toBe("2024-07-24");
  });
});
