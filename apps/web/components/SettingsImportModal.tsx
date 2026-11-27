"use client";

import { csvImportBlocked, type ParsedClubCsv } from "@myclub/shared";
import { Button, Modal, Table } from "@heroui/react";

const ROW_ERROR = "Fix the highlighted rows before continuing.";

export function SettingsImportModal({
  parsed,
  pending,
  title,
  onCancel,
  onConfirm,
}: {
  parsed: ParsedClubCsv | null;
  pending: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blockedMessage = !parsed
    ? null
    : parsed.fileError
      ? parsed.fileError
      : parsed.rows.some((row) => Object.keys(row.errors).length > 0)
        ? ROW_ERROR
        : null;

  return (
    <Modal.Backdrop isOpen={parsed !== null} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <Modal.Container size="cover">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="settings-import-note" data-testid="import-preview-note">
              Below is the data read from your file. Check if the data is correct.
            </p>
            {blockedMessage ? (
              <p className="banner" role="alert">
                {blockedMessage}
              </p>
            ) : null}
            {parsed ? (
              <div className="register-preview-table">
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label={`${title} import`}>
                      <Table.Header>
                        {parsed.columns.map((column, index) => (
                          <Table.Column key={column.key} isRowHeader={index === 0}>
                            {column.label}
                          </Table.Column>
                        ))}
                      </Table.Header>
                      <Table.Body>
                        {parsed.rows.length === 0 ? (
                          <Table.Row>
                            {parsed.columns.map((column, index) => (
                              <Table.Cell key={column.key}>{index === 0 ? "No rows." : ""}</Table.Cell>
                            ))}
                          </Table.Row>
                        ) : (
                          parsed.rows.map((row, rowIndex) => (
                            <Table.Row key={rowIndex}>
                              {parsed.columns.map((column) => (
                                <Table.Cell key={column.key}>
                                  <span>{row.rawCells[column.key] ?? ""}</span>
                                  {row.errors[column.key] ? (
                                    <span className="field-error" data-visible="">
                                      {row.errors[column.key]}
                                    </span>
                                  ) : null}
                                </Table.Cell>
                              ))}
                            </Table.Row>
                          ))
                        )}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="settings-import-footer">
            <Button isDisabled={pending} variant="outline" onPress={onCancel}>
              Cancel
            </Button>
            <Button isDisabled={csvImportBlocked(parsed) || pending} variant="primary" onPress={onConfirm}>
              {pending ? "Importing…" : "Confirm"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
