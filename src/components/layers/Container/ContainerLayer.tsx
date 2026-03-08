import React from 'react';

interface ContainerLayerProps {
  children: React.ReactNode;
}

const ContainerLayer: React.FC<ContainerLayerProps> = ({ children }) => {
  return (
    <div className="relative z-0 min-h-screen w-full flex flex-col p-8 overflow-y-auto">
      {/* 这是顶层容器，后续书签组件和动态配置都放在这里 */}
      <div className="max-w-7xl mx-auto w-full h-full">
        {children}
      </div>
    </div>
  );
};

export default ContainerLayer;
