import * as React from "react";
import { ChangeEvent, SetStateAction, useCallback } from "react";
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";

import { CodeFlow } from "../../../remote-queries/shared/analysis-result";

const getCodeFlowName = (codeFlow: CodeFlow) => {
  const filePath =
    codeFlow.threadFlows[codeFlow.threadFlows.length - 1].fileLink.filePath;
  return filePath.substring(filePath.lastIndexOf("/") + 1);
};

type CodeFlowsDropdownProps = {
  codeFlows: CodeFlow[];
  setSelectedCodeFlow: (value: SetStateAction<CodeFlow>) => void;
};

export const CodeFlowsDropdown = ({
  codeFlows,
  setSelectedCodeFlow,
}: CodeFlowsDropdownProps) => {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const selectedOption = e.target;
      const selectedIndex = selectedOption.value as unknown as number;
      setSelectedCodeFlow(codeFlows[selectedIndex]);
    },
    [setSelectedCodeFlow, codeFlows],
  );

  return (
    <VSCodeDropdown onChange={handleChange}>
      {codeFlows.map((codeFlow, index) => (
        <VSCodeOption key={index} value={index}>
          {getCodeFlowName(codeFlow)}
        </VSCodeOption>
      ))}
    </VSCodeDropdown>
  );
};
