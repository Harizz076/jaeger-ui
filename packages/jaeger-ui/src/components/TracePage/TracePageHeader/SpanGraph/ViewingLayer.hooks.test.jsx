// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { render } from '@testing-library/react';

const { draggerInstances } = vi.hoisted(() => ({ draggerInstances: [] }));

vi.mock('../../../../utils/DraggableManager', async () => {
  const actual = await vi.importActual('../../../../utils/DraggableManager');

  class MockDraggableManager {
    constructor(options) {
      this.options = options;
      this.tag = options.tag;
      this.dispose = vi.fn();
      this.resetBounds = vi.fn();
      this.handleMouseDown = vi.fn();
      this.handleMouseEnter = vi.fn();
      this.handleMouseLeave = vi.fn();
      this.handleMouseMove = vi.fn();
      draggerInstances.push(this);
    }

    triggerMouseMove(value) {
      this.options.onMouseMove?.({ manager: this, value });
    }

    triggerDragEnd(value) {
      this.options.onDragEnd?.({ manager: this, tag: this.tag, value });
    }
  }

  return { ...actual, default: MockDraggableManager };
});

import ViewingLayer, { dragTypes } from './ViewingLayer';

function getDragger(tag) {
  const dragger = draggerInstances.find(instance => instance.tag === tag);
  if (!dragger) {
    throw new Error(`No drag manager found for ${tag}`);
  }
  return dragger;
}

describe('<ViewingLayer /> hooks', () => {
  const baseProps = {
    height: 60,
    numTicks: 5,
    updateNextViewRangeTime: vi.fn(),
    updateViewRangeTime: vi.fn(),
    viewRange: { time: { current: [0, 1] } },
  };

  beforeEach(() => {
    draggerInstances.length = 0;
  });

  it('disposes every drag manager on unmount', () => {
    const { unmount } = render(<ViewingLayer {...baseProps} />);
    const draggers = [...draggerInstances];

    unmount();

    expect(draggers).toHaveLength(3);
    draggers.forEach(dragger => expect(dragger.dispose).toHaveBeenCalledOnce());
  });

  it('uses updated callback props from persistent drag managers', () => {
    const initialUpdateNext = vi.fn();
    const initialUpdateView = vi.fn();
    const updatedUpdateNext = vi.fn();
    const updatedUpdateView = vi.fn();
    const { rerender } = render(
      <ViewingLayer
        {...baseProps}
        updateNextViewRangeTime={initialUpdateNext}
        updateViewRangeTime={initialUpdateView}
      />
    );

    rerender(
      <ViewingLayer
        {...baseProps}
        updateNextViewRangeTime={updatedUpdateNext}
        updateViewRangeTime={updatedUpdateView}
      />
    );
    getDragger(dragTypes.REFRAME).triggerMouseMove(0.5);
    getDragger(dragTypes.REFRAME).triggerDragEnd(0.5);

    expect(initialUpdateNext).not.toHaveBeenCalled();
    expect(initialUpdateView).not.toHaveBeenCalled();
    expect(updatedUpdateNext).toHaveBeenCalledWith({ cursor: 0.5 });
    expect(updatedUpdateView).toHaveBeenCalledWith(0.5, 0.5, 'minimap');
  });
});
