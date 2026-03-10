"use client";

import type { SlideSpec } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSlideKindLabel } from "@/lib/slides/display";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SlideListProps {
  slides: SlideSpec[];
  selectedSlideId: string | null;
  onSelect: (slideId: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onReorder: (newSlides: SlideSpec[]) => void;
}

interface SortableSlideItemProps {
  slide: SlideSpec;
  index: number;
  isSelected: boolean;
  onSelect: (slideId: string) => void;
}

function SortableSlideItem({
  slide,
  index,
  isSelected,
  onSelect,
}: SortableSlideItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn(
        "flex items-stretch rounded-lg border transition-colors",
        isSelected ? "border-primary bg-accent" : "hover:bg-muted/50"
      )}
    >
      {/* ドラッグハンドル */}
      <div
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center px-2 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="並び替えハンドル"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* スライド情報 */}
      <button
        type="button"
        onClick={() => onSelect(slide.id)}
        className="min-w-0 flex-1 py-3 pr-3 text-left"
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>{index + 1}</span>
          <span>{getSlideKindLabel(slide.kind)}</span>
        </div>
        <div className="truncate text-sm font-medium">{slide.title}</div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {slide.bullets[0] || slide.body || "内容なし"}
        </div>
      </button>
    </div>
  );
}

export function SlideList({
  slides,
  selectedSlideId,
  onSelect,
  onAdd,
  onDelete,
  onReorder,
}: SlideListProps) {
  const selectedIndex = slides.findIndex((slide) => slide.id === selectedSlideId);

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = slides.findIndex((s) => s.id === active.id);
    const toIndex = slides.findIndex((s) => s.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(arrayMove(slides, fromIndex, toIndex));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div>
          <p className="text-sm font-semibold">スライド構成</p>
          <p className="text-xs text-muted-foreground">{slides.length} 枚</p>
        </div>
        <div className="flex gap-1">
          <Button size="xs" variant="outline" onClick={onAdd}>
            追加
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={onDelete}
            disabled={selectedIndex < 0}
          >
            削除
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slides.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 px-3 pb-3">
            {slides.map((slide, index) => (
              <SortableSlideItem
                key={slide.id}
                slide={slide}
                index={index}
                isSelected={slide.id === selectedSlideId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
