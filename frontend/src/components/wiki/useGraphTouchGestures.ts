import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

export type GraphTransform = {
  scale: number;
  tx: number;
  ty: number;
};

type ClientPoint = {
  x: number;
  y: number;
};

type TouchGesture =
  | { mode: 'idle' }
  | {
      mode: 'pan';
      pointerId: number;
      startClient: ClientPoint;
      startView: ClientPoint;
      startTransform: GraphTransform;
      moved: boolean;
    }
  | {
      mode: 'node';
      pointerId: number;
      nodeId: string;
      startClient: ClientPoint;
      moved: boolean;
    }
  | {
      mode: 'pinch';
      pointerIds: [number, number];
      startDistance: number;
      startScale: number;
      anchorGraph: ClientPoint;
    };

type UseGraphTouchGesturesOptions = {
  svgRef: React.RefObject<SVGSVGElement>;
  getTransform: () => GraphTransform;
  clientToViewPoint: (clientX: number, clientY: number) => ClientPoint | null;
  findNodeAtClientPoint: (clientX: number, clientY: number) => string | null;
  updateTransform: (transform: GraphTransform) => void;
  onInteractionStart: () => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeTap: (nodeId: string) => void;
  onNodeDoubleTap: (nodeId: string) => void;
  onNodeDragStart: (nodeId: string) => void;
  onNodeDragMove: (nodeId: string, clientX: number, clientY: number) => void;
  onNodeDragEnd: (nodeId: string, moved: boolean) => void;
};

const pointDistance = (a: ClientPoint, b: ClientPoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const midpoint = (a: ClientPoint, b: ClientPoint): ClientPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export function useGraphTouchGestures({
  svgRef,
  getTransform,
  clientToViewPoint,
  findNodeAtClientPoint,
  updateTransform,
  onInteractionStart,
  onNodeSelect,
  onNodeTap,
  onNodeDoubleTap,
  onNodeDragStart,
  onNodeDragMove,
  onNodeDragEnd,
}: UseGraphTouchGesturesOptions) {
  const pointersRef = useRef(new Map<number, ClientPoint>());
  const gestureRef = useRef<TouchGesture>({ mode: 'idle' });
  const suppressClickUntilRef = useRef(0);
  const pendingTapRef = useRef<{
    nodeId: string;
    time: number;
    timerId: number;
  } | null>(null);

  const cancelPendingTap = useCallback(() => {
    const pendingTap = pendingTapRef.current;
    if (pendingTap) window.clearTimeout(pendingTap.timerId);
    pendingTapRef.current = null;
  }, []);

  useEffect(() => cancelPendingTap, [cancelPendingTap]);

  const suppressSyntheticClick = useCallback(() => {
    suppressClickUntilRef.current = performance.now() + 700;
  }, []);

  const getFirstTwoPointers = useCallback(
    (): [[number, ClientPoint], [number, ClientPoint]] | null => {
      const pointers = [...pointersRef.current.entries()];
      if (pointers.length < 2) return null;
      return [pointers[0]!, pointers[1]!];
    },
    [],
  );

  const beginPinch = useCallback(() => {
    const points = getFirstTwoPointers();
    if (!points) return;

    const [[firstPointerId, a], [secondPointerId, b]] = points;
    const midClient = midpoint(a, b);
    const midView = clientToViewPoint(midClient.x, midClient.y);
    if (!midView) return;

    const previous = gestureRef.current;
    if (previous.mode === 'node' && previous.moved) {
      onNodeDragEnd(previous.nodeId, true);
    }

    const transform = getTransform();
    gestureRef.current = {
      mode: 'pinch',
      pointerIds: [firstPointerId, secondPointerId],
      startDistance: Math.max(1, pointDistance(a, b)),
      startScale: transform.scale,
      anchorGraph: {
        x: (midView.x - transform.tx) / transform.scale,
        y: (midView.y - transform.ty) / transform.scale,
      },
    };
    suppressSyntheticClick();
  }, [
    clientToViewPoint,
    getFirstTwoPointers,
    getTransform,
    onNodeDragEnd,
    suppressSyntheticClick,
  ]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<Element>) => {
      if (event.pointerType !== 'touch') return;
      event.preventDefault();
      onInteractionStart();

      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      suppressSyntheticClick();

      try {
        svgRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (pointersRef.current.size >= 2) {
        cancelPendingTap();
        beginPinch();
        return;
      }

      const nodeId = findNodeAtClientPoint(event.clientX, event.clientY);
      if (nodeId) {
        if (pendingTapRef.current?.nodeId !== nodeId) cancelPendingTap();
        onNodeSelect(nodeId);
        gestureRef.current = {
          mode: 'node',
          pointerId: event.pointerId,
          nodeId,
          startClient: { x: event.clientX, y: event.clientY },
          moved: false,
        };
        return;
      }

      cancelPendingTap();
      const startView = clientToViewPoint(event.clientX, event.clientY);
      if (!startView) return;
      gestureRef.current = {
        mode: 'pan',
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startView,
        startTransform: getTransform(),
        moved: false,
      };
    },
    [
      beginPinch,
      cancelPendingTap,
      clientToViewPoint,
      findNodeAtClientPoint,
      getTransform,
      onInteractionStart,
      onNodeSelect,
      suppressSyntheticClick,
      svgRef,
    ],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<Element>) => {
      if (event.pointerType !== 'touch' || !pointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointersRef.current.size >= 2) {
        const currentGesture = gestureRef.current;
        if (
          currentGesture.mode !== 'pinch'
          || !currentGesture.pointerIds.every((pointerId) => pointersRef.current.has(pointerId))
        ) {
          beginPinch();
        }
      }

      const gesture = gestureRef.current;
      if (gesture.mode === 'pinch') {
        const a = pointersRef.current.get(gesture.pointerIds[0]);
        const b = pointersRef.current.get(gesture.pointerIds[1]);
        if (!a || !b) return;
        const midClient = midpoint(a, b);
        const midView = clientToViewPoint(midClient.x, midClient.y);
        if (!midView) return;
        const distance = Math.max(1, pointDistance(a, b));
        const scale = Math.min(
          4,
          Math.max(0.15, gesture.startScale * (distance / gesture.startDistance)),
        );
        updateTransform({
          scale,
          tx: midView.x - gesture.anchorGraph.x * scale,
          ty: midView.y - gesture.anchorGraph.y * scale,
        });
        return;
      }

      if (gesture.mode === 'node' && gesture.pointerId === event.pointerId) {
        const dx = event.clientX - gesture.startClient.x;
        const dy = event.clientY - gesture.startClient.y;
        if (!gesture.moved && dx * dx + dy * dy > 36) {
          gesture.moved = true;
          cancelPendingTap();
          onNodeDragStart(gesture.nodeId);
        }
        if (gesture.moved) {
          onNodeDragMove(gesture.nodeId, event.clientX, event.clientY);
        }
        return;
      }

      if (gesture.mode === 'pan' && gesture.pointerId === event.pointerId) {
        const view = clientToViewPoint(event.clientX, event.clientY);
        if (!view) return;
        const dxClient = event.clientX - gesture.startClient.x;
        const dyClient = event.clientY - gesture.startClient.y;
        if (!gesture.moved && dxClient * dxClient + dyClient * dyClient > 25) {
          gesture.moved = true;
        }
        if (!gesture.moved) return;
        updateTransform({
          ...gesture.startTransform,
          tx: gesture.startTransform.tx + (view.x - gesture.startView.x),
          ty: gesture.startTransform.ty + (view.y - gesture.startView.y),
        });
      }
    },
    [
      beginPinch,
      cancelPendingTap,
      clientToViewPoint,
      onNodeDragMove,
      onNodeDragStart,
      updateTransform,
    ],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<Element>, cancelled: boolean) => {
      if (event.pointerType !== 'touch' || !pointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      pointersRef.current.delete(event.pointerId);
      suppressSyntheticClick();

      const gesture = gestureRef.current;
      if (gesture.mode === 'pinch') {
        const endedPinchPointer = gesture.pointerIds.includes(event.pointerId);
        if (pointersRef.current.size >= 2) {
          if (endedPinchPointer) beginPinch();
        } else if (pointersRef.current.size === 1) {
          const [pointerId, point] = [...pointersRef.current.entries()][0]!;
          const view = clientToViewPoint(point.x, point.y);
          if (view) {
            gestureRef.current = {
              mode: 'pan',
              pointerId,
              startClient: point,
              startView: view,
              startTransform: getTransform(),
              moved: true,
            };
          }
        } else {
          gestureRef.current = { mode: 'idle' };
        }
      } else if (gesture.mode === 'node' && gesture.pointerId === event.pointerId) {
        if (gesture.moved) {
          onNodeDragEnd(gesture.nodeId, true);
        } else if (!cancelled) {
          const now = performance.now();
          const pendingTap = pendingTapRef.current;
          if (
            pendingTap
            && pendingTap.nodeId === gesture.nodeId
            && now - pendingTap.time < 380
          ) {
            window.clearTimeout(pendingTap.timerId);
            pendingTapRef.current = null;
            onNodeDoubleTap(gesture.nodeId);
          } else {
            cancelPendingTap();
            const timerId = window.setTimeout(() => {
              if (pendingTapRef.current?.timerId !== timerId) return;
              pendingTapRef.current = null;
              onNodeTap(gesture.nodeId);
            }, 380);
            pendingTapRef.current = {
              nodeId: gesture.nodeId,
              time: now,
              timerId,
            };
          }
        }
        gestureRef.current = { mode: 'idle' };
      } else if (gesture.mode === 'pan' && gesture.pointerId === event.pointerId) {
        gestureRef.current = { mode: 'idle' };
      }

      try {
        svgRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [
      cancelPendingTap,
      clientToViewPoint,
      getTransform,
      onNodeDoubleTap,
      onNodeDragEnd,
      onNodeTap,
      suppressSyntheticClick,
      svgRef,
    ],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<Element>) => finishPointer(event, false),
    [finishPointer],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<Element>) => finishPointer(event, true),
    [finishPointer],
  );

  const shouldSuppressClick = useCallback(
    () => performance.now() < suppressClickUntilRef.current,
    [],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    shouldSuppressClick,
  };
}
