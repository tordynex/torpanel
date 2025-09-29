from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.post("/create", response_model=schemas.NewsOut)
def create_news(news: schemas.NewsCreate, db: Session = Depends(get_db)):
    new_news = models.News(
        title=news.title,
        content=news.content,
        date=news.date,  # skicka in "YYYY-MM-DD" från klienten
    )
    db.add(new_news)
    db.commit()
    db.refresh(new_news)
    return new_news


@router.get("/all", response_model=List[schemas.NewsOut])
def get_all_news(db: Session = Depends(get_db)):
    # Senaste först
    return (
        db.query(models.News)
        .order_by(models.News.date.desc(), models.News.id.desc())
        .all()
    )


@router.get("/{news_id}", response_model=schemas.NewsOut)
def get_news(news_id: int, db: Session = Depends(get_db)):
    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Nyhet hittades inte")
    return item


@router.put("/edit/{news_id}", response_model=schemas.NewsOut)
def update_news(news_id: int, data: schemas.NewsCreate, db: Session = Depends(get_db)):
    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Nyhet hittades inte")

    item.title = data.title
    item.content = data.content
    item.date = data.date

    db.commit()
    db.refresh(item)
    return item


@router.delete("/delete/{news_id}", status_code=204)
def delete_news(news_id: int, db: Session = Depends(get_db)):
    item = db.query(models.News).filter(models.News.id == news_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Nyhet hittades inte")
    db.delete(item)
    db.commit()
