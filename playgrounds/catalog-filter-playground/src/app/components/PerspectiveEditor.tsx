import { Button, Input } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";

import type { PerspectiveDraft, WorkflowDraft } from "../model";

interface PerspectiveEditorProps {
  perspective: PerspectiveDraft;
  /** label shown in the header, e.g. "Perspektive 1" */
  label: string;
  onChange: (perspective: PerspectiveDraft) => void;
  onRemove: () => void;
}

const PerspectiveEditor = ({
  perspective,
  label,
  onChange,
  onRemove,
}: PerspectiveEditorProps) => {
  const handleAddWorkflow = () => {
    const nextKey =
      perspective.workflows.reduce((max, draft) => Math.max(max, draft.key), -1) +
      1;
    onChange({
      ...perspective,
      workflows: [
        ...perspective.workflows,
        { key: nextKey, id: "", title: "", description: "" },
      ],
    });
  };

  const handleWorkflowChange = (changed: WorkflowDraft) => {
    onChange({
      ...perspective,
      workflows: perspective.workflows.map((draft) =>
        draft.key === changed.key ? changed : draft
      ),
    });
  };

  const handleWorkflowRemove = (key: number) => {
    onChange({
      ...perspective,
      workflows: perspective.workflows.filter((draft) => draft.key !== key),
    });
  };

  return (
    <div className="border border-gray-300 rounded-lg p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onRemove}
          aria-label="Perspektive entfernen"
        />
      </div>
      <Input
        addonBefore="id"
        placeholder="versorgung"
        value={perspective.id}
        onChange={(event) =>
          onChange({ ...perspective, id: event.target.value })
        }
      />
      <Input
        placeholder="Titel der Perspektive"
        value={perspective.title}
        onChange={(event) =>
          onChange({ ...perspective, title: event.target.value })
        }
      />

      <div className="flex flex-col gap-2 pl-2 border-l-2 border-gray-200">
        {perspective.workflows.map((workflow, index) => (
          <div
            key={workflow.key}
            className="border border-gray-200 rounded-md p-2 flex flex-col gap-1.5 bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Workflow {index + 1}
              </span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => handleWorkflowRemove(workflow.key)}
                aria-label="Workflow entfernen"
              />
            </div>
            <Input
              size="small"
              addonBefore="id"
              placeholder="beispiel-workflow"
              value={workflow.id}
              onChange={(event) =>
                handleWorkflowChange({ ...workflow, id: event.target.value })
              }
            />
            <Input
              size="small"
              placeholder="Titel"
              value={workflow.title}
              onChange={(event) =>
                handleWorkflowChange({ ...workflow, title: event.target.value })
              }
            />
            <Input.TextArea
              rows={2}
              placeholder="Beschreibung (optional)"
              value={workflow.description}
              onChange={(event) =>
                handleWorkflowChange({
                  ...workflow,
                  description: event.target.value,
                })
              }
            />
            <Input
              size="small"
              placeholder="Thumbnail-Link (optional)"
              value={workflow.thumbnail}
              onChange={(event) =>
                handleWorkflowChange({
                  ...workflow,
                  thumbnail: event.target.value,
                })
              }
            />
          </div>
        ))}
        <Button size="small" icon={<PlusOutlined />} onClick={handleAddWorkflow}>
          Workflow hinzufügen
        </Button>
      </div>
    </div>
  );
};

export default PerspectiveEditor;
