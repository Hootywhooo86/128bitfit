import { describe, expect, it } from 'vitest';
import { extensionOf, isTransient, photoFileName, photoPath } from './food-photo';

describe('photo file naming', () => {
  it('keeps the camera extension', () => {
    expect(extensionOf('file:///cache/IMG_0001.jpg')).toBe('.jpg');
    expect(extensionOf('file:///cache/shot.PNG')).toBe('.png');
    expect(extensionOf('file:///cache/shot.heic')).toBe('.heic');
  });

  it('falls back to .jpg for anything unexpected', () => {
    expect(extensionOf('file:///cache/no-extension')).toBe('.jpg');
    expect(extensionOf('file:///cache/weird.exe')).toBe('.jpg');
  });

  it('ignores a query string or fragment', () => {
    expect(extensionOf('file:///cache/a.png?w=100')).toBe('.png');
    expect(extensionOf('file:///cache/a.png#top')).toBe('.png');
  });

  it('never lets a food id escape the photo directory', () => {
    // A row could be imported from somewhere with a hostile id.
    const name = photoFileName('../../etc/passwd', 'x.jpg');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name).toBe('______etc_passwd.jpg');
  });

  it('gives one food one filename, so a re-shoot replaces the old photo', () => {
    expect(photoFileName('custom_abc', 'file:///cache/one.jpg')).toBe(
      photoFileName('custom_abc', 'file:///cache/two.jpg')
    );
  });
});

describe('photo path', () => {
  it('lands under the document directory', () => {
    expect(photoPath('file:///docs/', 'custom_abc', 'a.jpg')).toBe(
      'file:///docs/food-photos/custom_abc.jpg'
    );
  });

  it('tolerates a document directory with no trailing slash', () => {
    expect(photoPath('file:///docs', 'custom_abc', 'a.jpg')).toBe(
      'file:///docs/food-photos/custom_abc.jpg'
    );
  });
});

describe('transient camera files', () => {
  it('spots a photo still sitting in the cache', () => {
    expect(isTransient('file:///cache/IMG.jpg', 'file:///cache/')).toBe(true);
  });

  it('does not flag one already copied to documents', () => {
    expect(isTransient('file:///docs/food-photos/a.jpg', 'file:///cache/')).toBe(false);
  });

  it('is false when there is no cache directory to compare against', () => {
    expect(isTransient('file:///anything.jpg', null)).toBe(false);
  });
});
