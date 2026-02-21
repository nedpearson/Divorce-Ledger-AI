import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon, BuildingOfficeIcon, UserIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useWorkspaceStore } from '@/store/workspaceStore';

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, switchWorkspace } = useWorkspaceStore();

  const activeWorkspace = workspaces.find(w => w.workspace_id === activeWorkspaceId);

  if (workspaces.length === 0) {
    return null;
  }

  if (workspaces.length === 1) {
    return (
      <div className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md">
        <div className="flex items-center">
          {activeWorkspace?.workspace_type === 'firm' ? (
            <BuildingOfficeIcon className="w-5 h-5 mr-2 text-gray-400" />
          ) : (
            <UserIcon className="w-5 h-5 mr-2 text-gray-400" />
          )}
          <span>{activeWorkspace?.workspace_name}</span>
        </div>
      </div>
    );
  }

  return (
    <Menu as="div" className="relative inline-block text-left w-full">
      <div>
        <Menu.Button className="inline-flex w-full justify-between items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
          <div className="flex items-center">
            {activeWorkspace?.workspace_type === 'firm' ? (
              <BuildingOfficeIcon className="w-5 h-5 mr-2 text-gray-400" />
            ) : (
              <UserIcon className="w-5 h-5 mr-2 text-gray-400" />
            )}
            <span className="truncate">{activeWorkspace?.workspace_name || 'Select Workspace'}</span>
          </div>
          <ChevronDownIcon className="ml-2 h-5 w-5 text-gray-400" aria-hidden="true" />
        </Menu.Button>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute left-0 z-10 mt-2 w-full origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {workspaces.map((workspace) => (
              <Menu.Item key={workspace.workspace_id}>
                {({ active }) => (
                  <button
                    onClick={() => switchWorkspace(workspace.workspace_id)}
                    className={`
                      ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                      ${workspace.workspace_id === activeWorkspaceId ? 'font-semibold' : ''}
                      group flex w-full items-center px-4 py-2 text-sm
                    `}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        {workspace.workspace_type === 'firm' ? (
                          <BuildingOfficeIcon className="w-5 h-5 mr-2 text-gray-400" />
                        ) : (
                          <UserIcon className="w-5 h-5 mr-2 text-gray-400" />
                        )}
                        <div className="text-left">
                          <div>{workspace.workspace_name}</div>
                          <div className="text-xs text-gray-500 capitalize">
                            {workspace.workspace_type} • {workspace.role.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      {workspace.workspace_id === activeWorkspaceId && (
                        <CheckIcon className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
