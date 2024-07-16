import { Dispatch, SetStateAction, useEffect, useRef } from 'react';

export const useIntersectionObserver = (
  setActiveId: Dispatch<SetStateAction<string | undefined>>,
  ids: string[]
) => {
  const headingElementsRef = useRef({});
  useEffect(() => {
    const callback = (heading: IntersectionObserverEntry) => {
      headingElementsRef.current = heading;

      const visibleHeadings: IntersectionObserverEntry[] = [];
      Object.keys(headingElementsRef.current).forEach((key) => {
        const headingElement = headingElementsRef.current[key];
        if (headingElement.isIntersecting) visibleHeadings.push(headingElement);
      });

      const getIndexFromId = (id: any) => {
        return elements.findIndex((heading) => heading.id === id);
      };

      if (visibleHeadings.length === 1) {
        setActiveId(visibleHeadings[0].target.id);
      } else if (visibleHeadings.length > 1) {
        const sortedVisibleHeadings = visibleHeadings.sort(
          (a, b) => getIndexFromId(a.target.id) - getIndexFromId(b.target.id)
        );
        setActiveId(sortedVisibleHeadings[0].target.id);
      }
    };

    const observer = new IntersectionObserver(callback as any, {
      rootMargin: '-100px 0px -20% 0px',
    });
    const elements: HTMLElement[] = [];

    for (let i = 0; i < ids.length; i++) {
      const element = document.getElementById(ids[i]);
      if (element) {
        elements.push(element);
      }
    }

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [setActiveId]);
};
