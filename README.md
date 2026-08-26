# Minut take-home assignment (fullstack)

Thank you for taking the time for this assignment. We aim for the assignment to take roughly 4 hours, but it may take a little longer. As soon as you are done please submit it to us either as a compressed file or as a git repository which we can access. Please do not post this document online or share it with anyone else. If you need clarifications don’t hesitate to contact us.

In this assignment you will build a simple booking system that can be used for managing guests staying at a rented flat. The end user is someone managing a flat on Airbnb or similar.

## Part 1. Create a simple REST API backend for a managing reservations and rental units
The backend should fulfill the following requirements:

- Build it using NodeJS with Typescript
- Runnable using Docker
- Expose an HTTP Rest API with CRUD support for the entities listed below.
- Store entities in a database. The project scaffolding provides a connection to mongodb, but feel free to switch this out with another database if you want.

### API entities:

#### Rental unit

Contains information about a rental unit/property/apartment. A rental unit contains at least a name, can also include an address.

#### Reservations

Contains booking information for a guest. A reservation contains at least a start and end date and guest name. It should be possible to query the API for all reservations by both rental unit and time.

## Part 2. Create a simple web application for viewing and managing the reservations and rental units

The web app should fulfill the following requirements.

- Use the API that you have created above.
- It should be possible to view the list of reservations
- It should be possible to view the list of rental units
- It should be possible to create and edit reservations
- It is fine to make the task technically simpler by not choosing the optimal UX solution.
- Use React, since our software stack is based on React we also prefer the solution to be completed with React.
- Regarding HTML, CSS & Javascript, feel free to use the latest and greatest. :)





## Interview expectations
During the interview we expect you to be able to present your solution and to answer questions related to how and why you’ve designed the project the way you did. Below are some topics we’re interested in discussing with you in detail (comments regarding these topics in the code are greatly appreciated) :

- API:
  - Design: Your design should take into account the relationship between the entities.
  - Documentation
  - Versioning
  - Input validation
- Authentication + Authorization
- Error handling
- Infrastructure for hosting applications
- Data modeling
  - Relationships
  - Versioning
- Security aspects
- Stability aspects
- Performance aspects
  - Scalability
- Testing
