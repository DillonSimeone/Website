#!/usr/bin/env node

/**
 * ============================================================================
 * JLCPCB Live Supply, Stock & SMT Assembly Cost Auditor
 * 
 * Directly queries JLCPCB's official parts catalog API to audit:
 * 1. Real-time stock counts (catches 0-stock shortfalls before ordering)
 * 2. Tiered unit prices based on order quantity (default: 10 boards)
 * 3. Library classification (Basic = $0 setup vs Extended = $3 setup fee)
 * 4. Assembly constraints (flags LGA/BGA "Standard Only" inspection packages)
 * 5. Full PCBA Quote breakdown (components + setup fees + stencil + joints)
 * 
 * Usage:
 *   node shared/check-jlc-supply.mjs [project_id] [--qty=N]
 *   node shared/check-jlc-supply.mjs 04
 *   node shared/check-jlc-supply.mjs 04 --qty=30
 *   node shared/check-jlc-supply.mjs C2934560
 *   node shared/check-jlc-supply.mjs --search="ESP32-C3"
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pcbSuiteRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
let targetArg = args.find(a => !a.startsWith("--")) || "04";
const qtyArg = args.find(a => a.startsWith("--qty="));
const searchArg = args.find(a => a.startsWith("--search="));
const jsonArg = args.includes("--json");

const orderQty = qtyArg ? parseInt(qtyArg.split("=")[1], 10) : 10;

// Terminal Color Formatting
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

/**
 * Queries the official JLCPCB overseas SMT component catalog API
 */
async function queryJlcPart(keyword) {
  const url = "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList";
  const body = {
    keyword: keyword.trim(),
    currentPage: 1,
    pageSize: 5
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://jlcpcb.com",
        "Referer": "https://jlcpcb.com/parts"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to reach JLCPCB API`);
    }

    const data = await res.json();
    const list = data?.data?.componentPageInfo?.list || data?.data?.list || [];
    return list;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Resolves unit price for a given order quantity from JLCPCB tiered pricing
 */
function resolveTierPrice(prices, qty) {
  if (!Array.isArray(prices) || prices.length === 0) return 0.0;
  for (const tier of prices) {
    const min = tier.startNumber || 1;
    const max = tier.endNumber === -1 ? Infinity : (tier.endNumber || Infinity);
    if (qty >= min && qty <= max) {
      return tier.productPrice || 0.0;
    }
  }
  return prices[0].productPrice || 0.0;
}

/**
 * Audits a single LCSC part number or search term
 */
async function auditSinglePart(partCode, qty = orderQty) {
  console.log(`\n${CYAN}🔍 Querying JLCPCB live inventory for: ${BOLD}${partCode}${RESET}...`);
  const list = await queryJlcPart(partCode);

  if (list.error) {
    console.error(`${RED}API Error: ${list.error}${RESET}`);
    return;
  }

  if (list.length === 0) {
    console.error(`${RED}❌ Part ${partCode} not found in JLCPCB parts library.${RESET}`);
    return;
  }

  const p = list[0];
  const unitPrice = resolveTierPrice(p.componentPrices, qty);
  const isBasic = p.componentLibraryType === "base";
  const isLGA = (p.componentSpecificationEn || "").toUpperCase().includes("LGA") || 
                (p.componentSpecificationEn || "").toUpperCase().includes("BGA");

  console.log(`\n${BOLD}======================================================${RESET}`);
  console.log(`📦 Component:     ${BOLD}${p.componentModelEn || p.componentNameEn}${RESET}`);
  console.log(`🔢 LCSC Part #:   ${GREEN}${p.componentCode}${RESET}`);
  console.log(`🏷️  Package:       ${p.componentSpecificationEn || "N/A"}`);
  console.log(`📊 Stock Level:   ${p.stockCount > 0 ? GREEN + p.stockCount.toLocaleString() + " units" : RED + "0 (OUT OF STOCK / SHORTFALL)"}${RESET}`);
  console.log(`🏛️  Library Type:  ${isBasic ? GREEN + "Basic ($0 setup fee)" : YELLOW + "Extended ($3.00 setup fee)"}${RESET}`);
  if (isLGA) {
    console.log(`⚠️  Inspection:    ${BLUE}[Standard Only] (Requires X-ray inspection)${RESET}`);
  }
  console.log(`💵 Unit Price:    $${unitPrice.toFixed(4)} (for qty ${qty})`);
  console.log(`💰 Total Part Cost: $${(unitPrice * qty).toFixed(2)} (for ${qty} boards)`);
  console.log(`${BOLD}======================================================${RESET}\n`);
}

/**
 * Audits a project's full BOM
 */
async function auditProjectBom(projectCode, qty = orderQty) {
  const projectMap = {
    "00": "00-starterPCB",
    "01": "01-V6Led",
    "02": "02-audioMotionReactiveLedHapticPCB",
    "03": "03-compactAudioMotionSquarePCB",
    "04": "04-smdAudioMotionBatonPCB"
  };

  const subdir = projectMap[projectCode] || projectCode;
  const circuitPath = path.resolve(pcbSuiteRoot, subdir, "src", "circuit.js");

  if (!fs.existsSync(circuitPath)) {
    console.error(`${RED}Cannot locate circuit.js at:${RESET} ${circuitPath}`);
    process.exit(1);
  }

  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  JLCPCB Live Supply, Stock & SMT Cost Auditor  [Project: ${subdir}]${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${GRAY}Target Quantity:${RESET} ${BOLD}${qty} fully assembled boards${RESET}`);
  console.log(`${GRAY}Scanning BOM and querying live inventory from JLCPCB API...${RESET}\n`);

  // Dynamically load project module and extract smtComponents
  const moduleUrl = pathToFileURL(circuitPath).href;
  const circuitModule = await import(moduleUrl);

  const dimMap = {
    "00": { boardWidth: 40, boardLength: 40 },
    "01": { boardWidth: 50, boardLength: 12 },
    "02": { boardWidth: 20, boardLength: 120 },
    "03": { boardWidth: 38, boardLength: 38 },
    "04": { boardWidth: 22, boardLength: 110 }
  };

  const circuit = await circuitModule.compileCircuit(dimMap[projectCode] || { boardWidth: 22, boardLength: 110 });
  const artifacts = await circuitModule.generateManufacturingArtifacts(circuit, { silkScale: 1.0 });

  // Extract BOM lines from generated BOM CSV
  const bomLines = artifacts.bomCsv.trim().split("\n").slice(1);
  const bomRows = bomLines.map(line => {
    // Basic CSV parser handling quoted columns
    const match = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g);
    if (!match) return null;
    const cols = match.map(c => c.replace(/^,/, "").replace(/^"/, "").replace(/"$/, "").trim());
    return {
      comment: cols[0],
      designator: cols[1],
      footprint: cols[2],
      lcsc: cols[3],
      qtyPerBoard: parseInt(cols[4] || "1", 10)
    };
  }).filter(Boolean);

  let totalComponentCost = 0;
  let uniqueExtendedFeeders = new Set();
  let hasStandardOnly = false;
  let hasShortfalls = false;

  const results = [];

  for (const row of bomRows) {
    process.stdout.write(`Fetching ${row.lcsc.padEnd(10)} (${row.designator})... `);
    const apiResults = await queryJlcPart(row.lcsc);

    if (apiResults.error || apiResults.length === 0) {
      console.log(`${RED}FAILED / NOT FOUND${RESET}`);
      results.push({
        ...row,
        found: false,
        stock: 0,
        unitPrice: 0,
        totalCost: 0,
        libType: "unknown"
      });
      continue;
    }

    const p = apiResults[0];
    const totalPartsNeeded = row.qtyPerBoard * qty;
    const unitPrice = resolveTierPrice(p.componentPrices, totalPartsNeeded);
    const rowCost = unitPrice * totalPartsNeeded;
    const isBasic = p.componentLibraryType === "base";
    const isLGA = (p.componentSpecificationEn || "").toUpperCase().includes("LGA") || 
                  (p.componentSpecificationEn || "").toUpperCase().includes("BGA");

    totalComponentCost += rowCost;
    if (!isBasic) {
      uniqueExtendedFeeders.add(row.lcsc);
    }
    if (isLGA) {
      hasStandardOnly = true;
    }
    if (p.stockCount < totalPartsNeeded) {
      hasShortfalls = true;
    }

    console.log(`${GREEN}✔ Stock: ${p.stockCount.toLocaleString()}${RESET} | $${unitPrice.toFixed(4)}/ea`);

    results.push({
      ...row,
      found: true,
      mfr: p.componentModelEn || p.componentNameEn,
      stock: p.stockCount,
      unitPrice,
      totalPartsNeeded,
      rowCost,
      isBasic,
      isLGA,
      spec: p.componentSpecificationEn || row.footprint
    });
  }

  // Print Summary Table
  console.log(`\n${BOLD}========================================================================================================${RESET}`);
  console.log(`${BOLD}Designator       LCSC Part  Type     Stock Level     Req  Unit Price  Subtotal   Flags & Warnings${RESET}`);
  console.log(`${BOLD}========================================================================================================${RESET}`);

  for (const r of results) {
    const des = r.designator.length > 15 ? r.designator.slice(0, 14) + "…" : r.designator.padEnd(16);
    const code = r.lcsc.padEnd(10);
    const type = r.isBasic ? `${GREEN}Basic   ${RESET}` : `${YELLOW}Extended${RESET}`;
    const stockStr = (r.stock || 0).toLocaleString().padStart(12);
    const reqStr = String(r.totalPartsNeeded).padStart(5);
    const priceStr = `$${r.unitPrice.toFixed(4)}`.padStart(11);
    const subStr = `$${r.rowCost.toFixed(2)}`.padStart(9);

    let flag = "";
    if (r.stock < r.totalPartsNeeded) {
      flag = `${RED}🚨 SHORTFALL (0 stock)${RESET}`;
    } else if (r.stock < 100) {
      flag = `${YELLOW}⚠️ Low Stock (<100)${RESET}`;
    } else if (r.isLGA) {
      flag = `${BLUE}ℹ️ Standard Only (LGA)${RESET}`;
    } else if (r.isBasic) {
      flag = `${DIM}✔ $0 Feeder Fee${RESET}`;
    }

    console.log(`${des} ${code} ${type} ${stockStr} ${reqStr} ${priceStr} ${subStr}   ${flag}`);
  }

  console.log(`${BOLD}========================================================================================================${RESET}`);

  // Full PCBA Cost Breakdown
  const extendedFeederCount = uniqueExtendedFeeders.size;
  const extendedFeederFees = extendedFeederCount * 3.00;
  const smtBaseSetupFee = hasStandardOnly ? 24.00 : 8.00; // Standard PCBA: $24 / Economic: $8
  const smtStencilFee = 1.50;
  const estimatedJointCount = results.reduce((sum, r) => sum + (r.totalPartsNeeded * 2), 0);
  const estimatedJointFee = estimatedJointCount * 0.0017;

  const estimatedGrandTotal = totalComponentCost + extendedFeederFees + smtBaseSetupFee + smtStencilFee + estimatedJointFee;
  const estimatedPerBoard = estimatedGrandTotal / qty;

  console.log(`\n${BOLD}${CYAN}📊 ESTIMATED JLCPCB SMT ORDER QUOTE (${qty} Fully Assembled Boards)${RESET}`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  1. Total Components Cost:             $${totalComponentCost.toFixed(2)}`);
  console.log(`  2. Extended Feeder Setup Fees:        $${extendedFeederFees.toFixed(2)}  (${extendedFeederCount} unique extended parts × $3.00)`);
  console.log(`  3. SMT Base Engineering Setup Fee:    $${smtBaseSetupFee.toFixed(2)}  (${hasStandardOnly ? "Standard PCBA (X-ray LGA required)" : "Economic PCBA"})`);
  console.log(`  4. SMT Laser Stencil Fee:             $${smtStencilFee.toFixed(2)}`);
  console.log(`  5. SMT Solder Joint Placement:        $${estimatedJointFee.toFixed(2)}  (~${estimatedJointCount} solder joints)`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  ${BOLD}ESTIMATED GRAND TOTAL (PCBA + Parts):  $${estimatedGrandTotal.toFixed(2)}${RESET}`);
  console.log(`  ${BOLD}ESTIMATED COST PER ASSEMBLED BOARD:    $${estimatedPerBoard.toFixed(2)} / board${RESET}`);
  console.log(`------------------------------------------------------------------------`);

  if (hasShortfalls) {
    console.log(`\n${RED}${BOLD}🚨 ALERT: One or more parts have insufficient inventory in JLCPCB warehouse!${RESET}`);
    console.log(`   Replace out-of-stock part numbers with active in-stock equivalents before ordering.`);
  } else {
    console.log(`\n${GREEN}${BOLD}✔ 100% OF BOM PARTS ARE IN STOCK AT JLCPCB!${RESET}`);
  }

  if (hasStandardOnly) {
    console.log(`${BLUE}ℹ️  NOTE: LGA sensors (LSM6DS3 / WMM7037) require "Standard PCBA" mode in JLCPCB checkout.${RESET}`);
  }
}

// CLI Execution Router
if (searchArg) {
  const query = searchArg.split("=")[1];
  console.log(`Searching JLCPCB parts catalog for: "${query}"...`);
  const list = await queryJlcPart(query);
  if (Array.isArray(list)) {
    console.log(`Found ${list.length} results:`);
    list.forEach(p => {
      console.log(`  • ${p.componentCode} | ${p.componentModelEn || p.componentNameEn} | Stock: ${p.stockCount} | $${(p.componentPrices?.[0]?.productPrice || 0).toFixed(4)} | ${p.componentLibraryType}`);
    });
  }
} else if (targetArg.toUpperCase().startsWith("C") && !isNaN(parseInt(targetArg.slice(1), 10))) {
  await auditSinglePart(targetArg.toUpperCase());
} else {
  await auditProjectBom(targetArg);
}
