import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  readonly value: string;
};

export function AutoGrowTextarea({ value, ...props }: AutoGrowTextareaProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    function resize(): void {
      if (!textarea) return;
      textarea.style.height = 'auto';
      const borders = textarea.offsetHeight - textarea.clientHeight;
      textarea.style.height = `${textarea.scrollHeight + borders}px`;
    }

    resize();
    let width = textarea.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const nextWidth = textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(textarea);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, props.rows]);

  return <textarea {...props} ref={ref} value={value} />;
}
