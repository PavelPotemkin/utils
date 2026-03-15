export const awaitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const getRandomInt = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export function createDelayedResolver<T>() {
  let res: ((value: T) => void) | undefined;

  const promise = new Promise<T>((resolve) => {
    res = resolve;
  });

  return {
    promise,
    resolve: (value: T) => res?.(value),
  };
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms = 300,
): {
  debouncedFunction: (this: ThisParameterType<T>, ...args: Parameters<T>) => void;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const debouncedFunction = function (
    this: ThisParameterType<T>,
    ...args: Parameters<T>
  ): void {
    cancel();
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, ms);
  };

  return { debouncedFunction, cancel };
}

export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

export const hexToRgba = (hex: string, alpha: number): string => {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const num = Number.parseInt(expanded, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
