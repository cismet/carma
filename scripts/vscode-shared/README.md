add this folder to your vscode workspace to get access to the shared launch and task configurations:

1. add this folder to your workspace
File > Add Folder to Workspace > select this folder
2. Save the workspace in your user home or git home of choice to name it.
File > Save Workspace As... > save to file

You now have access to the launch and task configurations in the Run and Debug pane.
shared configurations should appear with the vscode-shared suffix in the configurations list along with your existing configurations

if you prefer to use a single root workspace you can still manually copy and merge the contents of launch.json and tasks.json into the root workspace .vscode files or use these as reference

https://github.com/microsoft/vscode/issues/60043#issuecomment-1905752073
https://code.visualstudio.com/docs/editor/workspaces