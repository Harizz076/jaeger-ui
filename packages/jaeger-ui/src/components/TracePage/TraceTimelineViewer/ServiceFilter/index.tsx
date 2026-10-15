// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Checkbox, Popover, Tooltip } from 'antd';
import { IoFunnel, IoFunnelOutline } from 'react-icons/io5';

import colorGenerator from '../../../../utils/color-generator';
import { GenAISpanKind, IOtelTrace } from '../../../../types/otel';
import { EMPTY_SPAN_TYPE_FILTER, SpanTypeFilter } from '../generateRowStates';
import { SVC_FILTER_DEFAULTS_KEY, SvcFilterDefaults } from '../../url/svcFilter';

import './ServiceFilter.css';
import storage from '../../../../utils/storage';

type ServiceFilterProps = {
  trace: IOtelTrace;
  prunedServices: Set<string>;
  spanTypeFilter?: SpanTypeFilter;
  onApply: (prunedServices: Set<string>, spanTypeFilter?: SpanTypeFilter) => void;
};

const GEN_AI_KIND_LABELS: Record<GenAISpanKind, string> = {
  LLM_CALL: 'LLM calls',
  TOOL_CALL: 'Tool calls',
  AGENT: 'Agents',
  RETRIEVAL: 'Retrievals',
  UNKNOWN_GENAI: 'Other GenAI spans',
};

function saveDefaults(prunedServices: Set<string>) {
  const defaults: SvcFilterDefaults = { prunedServices: [...prunedServices] };
  storage.set(SVC_FILTER_DEFAULTS_KEY, defaults);
}

export default function ServiceFilter({
  trace,
  prunedServices,
  spanTypeFilter: providedSpanTypeFilter,
  onApply,
}: ServiceFilterProps) {
  const spanTypeFilter = providedSpanTypeFilter ?? EMPTY_SPAN_TYPE_FILTER;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [draftTypeFilter, setDraftTypeFilter] = useState<SpanTypeFilter>({
    hiddenGenAIKinds: new Set(),
    hideNonGenAISpans: false,
  });

  const serviceEntries = useMemo(() => {
    const sorted = [...trace.services].sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [trace.services]);

  // Services that own at least one root span.
  const rootServices = useMemo(() => {
    const names = new Set<string>();
    for (const span of trace.rootSpans) {
      names.add(span.resource.serviceName);
    }
    return names;
  }, [trace.rootSpans]);

  // When there's exactly one root service name (even across multiple root spans),
  // that service is locked — it cannot be deselected.
  const singleRootService = rootServices.size === 1;
  const lockedService = singleRootService ? [...rootServices][0] : null;

  const genAIKinds = useMemo(() => {
    const kinds = new Set<GenAISpanKind>();
    for (const span of trace.spans) {
      if (span.genAIKind) kinds.add(span.genAIKind);
    }
    return [...kinds].sort();
  }, [trace.spans]);

  const hasSpanTypeFilter = spanTypeFilter.hideNonGenAISpans || spanTypeFilter.hiddenGenAIKinds.size > 0;
  const isFilterActive = prunedServices.size > 0 || hasSpanTypeFilter;

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        // Initialize draft from current pruned state.
        setDraft(new Set(prunedServices));
        setDraftTypeFilter({
          hiddenGenAIKinds: new Set(spanTypeFilter.hiddenGenAIKinds),
          hideNonGenAISpans: spanTypeFilter.hideNonGenAISpans,
        });
      }
      setOpen(newOpen);
    },
    [prunedServices, spanTypeFilter]
  );

  const handleToggle = useCallback(
    (serviceName: string) => {
      if (serviceName === lockedService) return;
      setDraft(prev => {
        const next = new Set(prev);
        if (next.has(serviceName)) {
          next.delete(serviceName);
        } else {
          next.add(serviceName);
        }
        return next;
      });
    },
    [lockedService]
  );

  const handleSelectAll = useCallback(() => setDraft(new Set()), []);

  const handleSelectNone = useCallback(() => {
    const allExceptLocked = serviceEntries.filter(s => s.name !== lockedService).map(s => s.name);
    setDraft(new Set(allExceptLocked));
  }, [serviceEntries, lockedService]);

  const handleApply = useCallback(() => {
    if (providedSpanTypeFilter) onApply(draft, draftTypeFilter);
    else onApply(draft);
    setOpen(false);
  }, [draft, draftTypeFilter, onApply, providedSpanTypeFilter]);

  const handleSaveAsDefault = useCallback(() => {
    saveDefaults(draft);
    if (providedSpanTypeFilter) onApply(draft, draftTypeFilter);
    else onApply(draft);
    setOpen(false);
  }, [draft, draftTypeFilter, onApply, providedSpanTypeFilter]);

  const handleTypeToggle = useCallback((kind: GenAISpanKind | 'non-genai') => {
    setDraftTypeFilter(previous => {
      if (kind === 'non-genai') {
        return { ...previous, hideNonGenAISpans: !previous.hideNonGenAISpans };
      }
      const hiddenGenAIKinds = new Set(previous.hiddenGenAIKinds);
      if (hiddenGenAIKinds.has(kind)) hiddenGenAIKinds.delete(kind);
      else hiddenGenAIKinds.add(kind);
      return { ...previous, hiddenGenAIKinds };
    });
  }, []);

  // Validation: at least one root span must remain visible.
  const wouldRemoveAllRoots = useMemo(() => {
    for (const name of rootServices) {
      if (!draft.has(name)) return false;
    }
    return true;
  }, [draft, rootServices]);

  const allPruned = draft.size === serviceEntries.length;
  const applyDisabled = allPruned || wouldRemoveAllRoots;

  let applyWarning = '';
  if (allPruned) {
    applyWarning = 'At least one service must be visible';
  } else if (wouldRemoveAllRoots) {
    applyWarning = 'At least one root span service must remain visible';
  }

  const content = (
    <div className="ServiceFilter--popover" role="dialog" aria-label="Filter services">
      <div className="ServiceFilter--description">
        Select which spans are visible. Unselected spans are pruned along with their full subtrees.
      </div>
      <div className="ServiceFilter--actions">
        <Button size="small" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button size="small" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      {trace.isGenAITrace && (
        <>
          <div className="ServiceFilter--sectionTitle">Span types</div>
          <div className="ServiceFilter--list" role="group" aria-label="Span type visibility">
            <div className="ServiceFilter--item">
              <Checkbox
                checked={!draftTypeFilter.hideNonGenAISpans}
                onChange={() => handleTypeToggle('non-genai')}
                aria-label={`${draftTypeFilter.hideNonGenAISpans ? 'Show' : 'Hide'} non-GenAI spans`}
              >
                Non-GenAI spans
              </Checkbox>
            </div>
            {genAIKinds.map(kind => {
              const isVisible = !draftTypeFilter.hiddenGenAIKinds.has(kind);
              return (
                <div key={kind} className="ServiceFilter--item">
                  <Checkbox
                    checked={isVisible}
                    onChange={() => handleTypeToggle(kind)}
                    aria-label={`${isVisible ? 'Hide' : 'Show'} ${GEN_AI_KIND_LABELS[kind]}`}
                  >
                    {GEN_AI_KIND_LABELS[kind]}
                  </Checkbox>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="ServiceFilter--list" role="group" aria-label="Service visibility">
        {serviceEntries.map(({ name, numberOfSpans }) => {
          const isVisible = !draft.has(name);
          const color = colorGenerator.getColorByKey(name);
          const isRoot = rootServices.has(name);
          const isLocked = name === lockedService;
          return (
            <div key={name} className="ServiceFilter--item">
              <Checkbox
                checked={isVisible}
                disabled={isLocked}
                onChange={() => handleToggle(name)}
                aria-label={`${isVisible ? 'Hide' : 'Show'} ${name}`}
              >
                <span className="ServiceFilter--colorDot" style={{ backgroundColor: color }} />
                <span className="ServiceFilter--serviceName" title={name}>
                  {name}
                </span>
                {isRoot && <span className="ServiceFilter--rootBadge">root</span>}
                <span className="ServiceFilter--spanCount">
                  ({numberOfSpans} {numberOfSpans === 1 ? 'span' : 'spans'})
                </span>
              </Checkbox>
            </div>
          );
        })}
      </div>
      {applyWarning && (
        <div className="ServiceFilter--warning" role="alert">
          {applyWarning}
        </div>
      )}
      <div className="ServiceFilter--footer">
        <Button
          size="small"
          disabled={applyDisabled}
          onClick={handleSaveAsDefault}
          title="Apply and save as default for future traces"
        >
          Save as Default
        </Button>
        <Button type="primary" size="small" disabled={applyDisabled} onClick={handleApply}>
          Apply
        </Button>
      </div>
    </div>
  );

  // Don't show the filter only when neither services nor span types offer a choice.
  if (serviceEntries.length <= 1 && !trace.isGenAITrace) {
    return null;
  }

  return (
    <Popover
      content={content}
      title="Filter Services"
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomLeft"
    >
      <Tooltip title="Filter services">
        <span
          className={`ServiceFilter--button ${isFilterActive ? 'is-active' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={isFilterActive ? 'Trace filter active' : 'Filter trace'}
          aria-pressed={isFilterActive}
          data-testid="service-filter-button"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenChange(!open);
            }
          }}
        >
          {isFilterActive ? <IoFunnel /> : <IoFunnelOutline />}
        </span>
      </Tooltip>
    </Popover>
  );
}
