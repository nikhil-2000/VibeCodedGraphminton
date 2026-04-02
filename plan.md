# Graph-minton Roadmap

## Project Overview

Graph-minton is an application that parses badminton game data and player aliases, normalizes the data, and integrates it with a database to build a network of player relationships and match history.

## Roadmap

1. I want to be able to load all game data into the database, with proper handling of player aliases and relationships.
2. I want to be able to query the database for player statistics, partnerships, and opponent analysis
3. I want to be able to view player performance over time and analyze team compositions, ideally making graphical (nodes and edges) visualizations of the data.
4. I want to be able to highlight anomalies in the data, such as pairs who play together too often or to little, same for playing against each other, and players who consistenly play against weaker opponents, etc
5. I want to be able to upload games and aliases through the frontend, with proper validation and error handling.
6. I want to add authentication and user management to allow multiple users to access and contribute to the database while maintaining data integrity and security.

## Data

The data is stored in a CSV file with the following columns:

Scores Folder

- `date`: The date of the match
- `game_no`: The game number in the match
- `A`: The name of the first player
- `B`: The name of the second player
- `X`: The name of the third player
- `Y`: The name of the fourth player
- `PtsAB`: The points scored by players A and B
- `PtsXY`: The points scored by players X and Y

For example:
08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9

indicates that on April 8, 2024, in the first game of the evening, Bhavin and Chets scored 21 points against Chan and Jayesh, who scored 9 points.


Aliases Folder

The name of the file is the main name + the names are line seperated, for example:
File name: `John Doe.txt`
```
Johnny D.
J. Doe
``` 
means that `John Doe` is the main name, and `Johnny D.` and `J. Doe` are aliases for that player.

When we input the final data into the database, we will use the main name for each player, and we will also create relationships between the main name and the aliases to ensure that all data is properly linked and can handle future updates to the aliases.

## Technical Stack

### Database
I'm unsure how to store this data, the clear options are either a graph database like Neo4j or a relational database like PostgreSQL. I will need to evaluate the pros and cons of each option based on the specific requirements of the project, such as the complexity of the relationships between players and matches, the need for efficient querying, and the scalability of the database.

### Backend
I would like to use C# for the backend as I am trying to learn it however I would also consider using Python if it offers better libraries for data processing and database interaction. The backend will be responsible for parsing the CSV files, normalizing the data, and interacting with the database to store and retrieve information. Are there any other languages or frameworks that would be particularly well-suited for this type of application?

### Frontend
For the frontend, React feels like the obvious choice, any objections? It will be used to create a user interface for querying the database and visualizing player relationships and match history. I will also need to consider how to best visualize the data, especially if I choose to use a graph database, as this will require specific libraries for rendering graphs.




