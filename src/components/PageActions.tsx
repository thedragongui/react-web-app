import type { ReactNode } from 'react';
import './page-actions.css';

export type PageActionGroupProps = {
  children?: ReactNode;
};

export type PageActionsProps = {
  groups?: PageActionGroupProps[];
  children?: ReactNode;
};

export function PageActions({ groups, children }: PageActionsProps) {
  if (!groups?.length && !children) {
    return null;
  }
  return (
    <div className="page-actions">
      {groups?.map((group, index) => (
        <div key={index} className="page-action-group">
          {group.children}
        </div>
      ))}
      {children}
    </div>
  );
}

export function PageActionGroup({ children }: PageActionGroupProps) {
  if (!children) return null;
  return <div className="page-action-group">{children}</div>;
}

