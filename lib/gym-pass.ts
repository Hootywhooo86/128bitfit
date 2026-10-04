/**
 * The gym pass: what is saved, and how a scanned barcode is drawn again.
 *
 * A scanned code is stored as its value and format and redrawn crisply, which
 * a desk scanner reads more reliably than a photo of a card. The photo stays
 * as the fallback, and as the only option for a code that cannot be redrawn.
 */
import bwipjs from 'bwip-js/generic';

export type ScannedCode = { value: string; format: string };

export type GymPass = {
  photoUri: string | null;
  memberNumber: string;
  barcode: ScannedCode | null;
  /** Which to show at the desk when both exist. */
  show: 'barcode' | 'photo';
};

export const EMPTY_PASS: GymPass = { photoUri: null, memberNumber: '', barcode: null, show: 'barcode' };

/** Reads what was saved, including passes saved before scanning existed (photo and number only). */
export function parsePass(raw: string | null): GymPass {
  try {
    const v = raw ? JSON.parse(raw) : null;
    const b = v?.barcode;
    return {
      photoUri: typeof v?.photoUri === 'string' ? v.photoUri : null,
      memberNumber: typeof v?.memberNumber === 'string' ? v.memberNumber : '',
      barcode:
        b && typeof b.value === 'string' && b.value && typeof b.format === 'string' ? { value: b.value, format: b.format } : null,
      show: v?.show === 'photo' ? 'photo' : 'barcode',
    };
  } catch {
    return { ...EMPTY_PASS };
  }
}

/**
 * expo-camera's barcode type names → bwip-js encoder names. Android and iOS
 * spell some differently ("upc_a" vs "upca"), so both are listed.
 */
const BCID: Record<string, string> = {
  qr: 'qrcode',
  code128: 'code128',
  code39: 'code39',
  code93: 'code93',
  ean13: 'ean13',
  ean8: 'ean8',
  upc_a: 'upca',
  upca: 'upca',
  upc_e: 'upce',
  upce: 'upce',
  pdf417: 'pdf417',
  aztec: 'azteccode',
  datamatrix: 'datamatrix',
  itf14: 'itf14',
  itf: 'interleaved2of5',
  interleaved2of5: 'interleaved2of5',
  codabar: 'rationalizedCodabar',
};

const TWO_D = new Set(['qrcode', 'pdf417', 'azteccode', 'datamatrix']);

export function encoderFor(format: string): string | null {
  return BCID[format.toLowerCase().replace(/[^a-z0-9_]/g, '')] ?? null;
}

/**
 * The barcode as an SVG string, or null when it cannot be drawn faithfully —
 * an unknown format, or a value the format's rules reject. Never a guess: a
 * wrong barcode at the desk is worse than the photo.
 */
export function barcodeSvg(code: ScannedCode): string | null {
  const bcid = encoderFor(code.format);
  if (!bcid) return null;
  try {
    return bwipjs.toSVG({
      bcid,
      text: code.value,
      scale: 3,
      // Quiet zones, so the scanner finds the edges.
      paddingwidth: TWO_D.has(bcid) ? 4 : 12,
      paddingheight: 4,
      backgroundcolor: 'FFFFFF',
      ...(TWO_D.has(bcid) ? {} : { height: 18 }),
    });
  } catch {
    return null;
  }
}

/** What the desk sees: the redrawn barcode if it can be drawn and is chosen, else the photo. */
export function passView(pass: GymPass): 'barcode' | 'photo' | 'none' {
  const canDraw = pass.barcode != null && barcodeSvg(pass.barcode) != null;
  if (canDraw && (pass.show === 'barcode' || !pass.photoUri)) return 'barcode';
  if (pass.photoUri) return 'photo';
  return 'none';
}
