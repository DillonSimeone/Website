# Antigravity IDE Conversation History Glue

This folder contains a workaround (a "glue" patch) to resolve a state synchronization issue in the Antigravity IDE where past conversations are saved to disk but go missing from the IDE's history sidebar list.

## Components

1.  **[register_all_convs.py](file:///f:/Github/Website/public/Glue/register_all_convs.py)**:
    *   Scans the local `conversations/` directory for SQLite databases (`.db` files).
    *   Extracts the actual conversation start and modification timestamps recorded in the step metadata.
    *   Finds a clean conversation title by parsing user prompt text strings (filtering out system UUIDs).
    *   Sorts all trajectories chronologically and rebuilds the `trajectorySummaries` cache inside VS Code's global state database (`state.vscdb`).
2.  **[launch_antigravity.bat](file:///f:/Github/Website/public/Glue/launch_antigravity.bat)**:
    *   Runs the python synchronizer script.
    *   Launches the Antigravity IDE executable with the targeted directory path.

## Shell Integration

The Windows context menu (`Open with Antigravity IDE` option) is configured to execute `launch_antigravity.bat`. This guarantees that whenever you open a project folder in the IDE, your conversation history index is automatically rebuilt and updated first.
