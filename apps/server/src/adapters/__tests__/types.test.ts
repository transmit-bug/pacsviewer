import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AdapterEventEmitter } from '../types';

describe('AdapterEventEmitter', () => {
  let emitter: AdapterEventEmitter;

  beforeEach(() => {
    emitter = new AdapterEventEmitter();
  });

  test('should register and emit events', () => {
    let received: any = null;
    emitter.on('image:received', (data) => {
      received = data;
    });

    emitter.emit('image:received', { id: 'test-1' });
    expect(received).toEqual({ id: 'test-1' });
  });

  test('should support multiple listeners', () => {
    const calls: string[] = [];
    emitter.on('adapter:started', () => calls.push('a'));
    emitter.on('adapter:started', () => calls.push('b'));

    emitter.emit('adapter:started', {});
    expect(calls).toEqual(['a', 'b']);
  });

  test('should unsubscribe via returned function', () => {
    const calls: number[] = [];
    const unsub = emitter.on('adapter:status', () => calls.push(1));

    emitter.emit('adapter:status', {});
    expect(calls).toHaveLength(1);

    unsub();
    emitter.emit('adapter:status', {});
    expect(calls).toHaveLength(1);
  });

  test('should unsubscribe via off()', () => {
    const calls: number[] = [];
    const listener = () => calls.push(1);
    emitter.on('adapter:error', listener);

    emitter.emit('adapter:error', {});
    expect(calls).toHaveLength(1);

    emitter.off('adapter:error', listener);
    emitter.emit('adapter:error', {});
    expect(calls).toHaveLength(1);
  });

  test('should remove all listeners for a specific event', () => {
    const calls: string[] = [];
    emitter.on('image:received', () => calls.push('img'));
    emitter.on('adapter:error', () => calls.push('err'));

    emitter.removeAllListeners('image:received');
    emitter.emit('image:received', {});
    emitter.emit('adapter:error', {});

    expect(calls).toEqual(['err']);
  });

  test('should remove all listeners when no event specified', () => {
    const calls: string[] = [];
    emitter.on('image:received', () => calls.push('img'));
    emitter.on('adapter:error', () => calls.push('err'));

    emitter.removeAllListeners();
    emitter.emit('image:received', {});
    emitter.emit('adapter:error', {});

    expect(calls).toEqual([]);
  });

  test('should not throw if listener throws', () => {
    emitter.on('image:received', () => {
      throw new Error('boom');
    });

    // Should not throw
    expect(() => emitter.emit('image:received', {})).not.toThrow();
  });
});
