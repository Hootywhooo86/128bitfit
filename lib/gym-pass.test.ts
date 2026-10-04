import { describe, expect, it } from 'vitest';
import { barcodeSvg, encoderFor, parsePass, passView } from './gym-pass';

describe('gym pass', () => {
  it('still reads a pass saved before scanning existed', () => {
    const old = parsePass(JSON.stringify({ photoUri: 'file:///p.jpg', memberNumber: '42' }));
    expect(old).toEqual({ photoUri: 'file:///p.jpg', memberNumber: '42', barcode: null, show: 'barcode' });
    expect(passView(old)).toBe('photo');
  });

  it('reads junk as an empty pass', () => {
    expect(parsePass('not json')).toMatchObject({ photoUri: null, barcode: null });
    expect(parsePass(null).memberNumber).toBe('');
  });

  it('knows both platforms’ names for each format', () => {
    expect(encoderFor('qr')).toBe('qrcode');
    expect(encoderFor('upc_a')).toBe('upca');
    expect(encoderFor('upca')).toBe('upca');
    expect(encoderFor('code128')).toBe('code128');
    expect(encoderFor('mystery')).toBeNull();
  });

  it('redraws the common gym-card formats', () => {
    expect(barcodeSvg({ value: '1234567890', format: 'code128' })).toMatch(/^<svg/);
    expect(barcodeSvg({ value: 'MEMBER-00042', format: 'code39' })).toMatch(/^<svg/);
    expect(barcodeSvg({ value: 'https://gym.example/m/42', format: 'qr' })).toMatch(/^<svg/);
    expect(barcodeSvg({ value: '5901234123457', format: 'ean13' })).toMatch(/^<svg/);
  });

  it('refuses rather than guesses', () => {
    expect(barcodeSvg({ value: '123', format: 'mystery' })).toBeNull();
    expect(barcodeSvg({ value: 'not digits', format: 'ean13' })).toBeNull();
  });

  it('shows the scanned code by default, the photo when chosen or when the code cannot be drawn', () => {
    const both = { photoUri: 'file:///p.jpg', memberNumber: '', barcode: { value: '1234567890', format: 'code128' }, show: 'barcode' as const };
    expect(passView(both)).toBe('barcode');
    expect(passView({ ...both, show: 'photo' })).toBe('photo');
    expect(passView({ ...both, barcode: { value: 'x', format: 'mystery' } })).toBe('photo');
    expect(passView({ ...both, photoUri: null, show: 'photo' })).toBe('barcode');
    expect(passView({ photoUri: null, memberNumber: '', barcode: null, show: 'barcode' })).toBe('none');
  });
});
