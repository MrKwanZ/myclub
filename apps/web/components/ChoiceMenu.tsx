"use client";

import { Button, Dropdown, Label } from "@heroui/react";

export function ChoiceMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const current = options.find((option) => option.id === value);

  return (
    <Dropdown>
      <Button aria-label={label} className="choice-menu" variant="secondary">
        {current?.label ?? label}
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={label}
          selectedKeys={new Set([value])}
          selectionMode="single"
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const next = [...keys][0];
            if (next == null) return;
            onChange(String(next));
          }}
        >
          {options.map((option) => (
            <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
              <Dropdown.ItemIndicator />
              <Label>{option.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
