import React from 'react';
import { useTranslation } from 'react-i18next';

export type UploadStepKey =
  | 'select'
  | 'config'
  | 'sheets'
  | 'analyzing'
  | 'mapping'
  | 'accounts'
  | 'categories'
  | 'preview'
  | 'manual'
  | 'uploading'
  | 'success'
  | 'error';

const STEPPER_KEYS = ['select', 'config', 'mapping', 'preview', 'uploading'] as const;

const STEP_PROGRESS: Record<UploadStepKey, number> = {
  select: 0,
  sheets: 1,
  config: 1,
  analyzing: 2,
  mapping: 2,
  accounts: 2,
  categories: 2,
  preview: 3,
  manual: 3,
  uploading: 4,
  success: 4,
  error: 4,
};

interface UploadStepperProps {
  step: UploadStepKey;
}

const UploadStepper: React.FC<UploadStepperProps> = ({ step }) => {
  const { t } = useTranslation();
  const current = STEP_PROGRESS[step] ?? 0;

  return (
    <div className="upload-stepper">
      {STEPPER_KEYS.map((key, index) => {
        const isActive = index === current;
        const isDone = index < current;
        return (
          <React.Fragment key={key}>
            <div className="upload-stepper-item">
              <div
                className={`upload-stepper-circle ${
                  isActive ? 'is-active' : isDone ? 'is-done' : 'is-todo'
                }`}
              >
                {index + 1}
              </div>
              <span className="upload-stepper-label">{t(`upload.step${index + 1}`)}</span>
            </div>
            {index < STEPPER_KEYS.length - 1 && <div className="upload-stepper-line" />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default UploadStepper;
